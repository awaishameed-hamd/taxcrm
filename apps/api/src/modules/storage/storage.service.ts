import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'

// Where each kind of upload lands inside the bucket, so the bucket stays
// browsable by the kind of work the file belongs to rather than one big dump.
export const STORAGE_FOLDERS = [
  'sales-tax',
  'income-tax',
  'wht',
  'notices-appeals',
  'general-tasks',
  'chat',
  'payment-proofs',
  'misc',
] as const

export type StorageFolder = typeof STORAGE_FOLDERS[number]

// A stored file is referenced by its object key, never by a path on this server.
// Legacy rows still hold '/uploads/...' paths from before B2, so anything starting
// with a slash is treated as a local legacy file and served the old way.
export function isLegacyPath(ref: string): boolean {
  return ref.startsWith('/uploads/')
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)
  private client: S3Client | null = null

  constructor(private config: ConfigService) {}

  get bucket(): string {
    return this.config.get<string>('b2.bucket') ?? ''
  }

  get isConfigured(): boolean {
    return !!(this.bucket && this.config.get<string>('b2.keyId') && this.config.get<string>('b2.appKey'))
  }

  private get ttl(): number {
    return this.config.get<number>('b2.signedUrlTtlSeconds') ?? 900
  }

  private s3(): S3Client {
    if (!this.isConfigured) {
      throw new BadRequestException('File storage is not configured on the server')
    }
    if (!this.client) {
      let endpoint = this.config.get<string>('b2.endpoint') ?? ''
      if (endpoint && !endpoint.startsWith('http')) endpoint = `https://${endpoint}`
      this.client = new S3Client({
        endpoint,
        region: this.config.get<string>('b2.region'),
        credentials: {
          accessKeyId:     this.config.get<string>('b2.keyId')!,
          secretAccessKey: this.config.get<string>('b2.appKey')!,
        },
      })
    }
    return this.client
  }

  // A unique key that keeps the original extension, so the file opens in the
  // right app, but never exposes the original name in the bucket.
  buildKey(folder: StorageFolder, originalName: string): string {
    const ext  = path.extname(originalName || '').slice(0, 12)
    const safe = /^[.a-zA-Z0-9]*$/.test(ext) ? ext : ''
    return `${folder}/${uuidv4()}${safe}`
  }

  // Link the browser uses to PUT the file straight to B2, so the bytes never
  // touch this server.
  async presignUpload(key: string, contentType?: string): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key:    key,
      ...(contentType ? { ContentType: contentType } : {}),
    })
    return getSignedUrl(this.s3(), cmd, { expiresIn: this.ttl })
  }

  // Link the browser follows to read the file straight from B2. `downloadName`
  // makes the browser save it under the original filename.
  async presignDownload(key: string, downloadName?: string, inline = true): Promise<string> {
    const disposition = downloadName
      ? `${inline ? 'inline' : 'attachment'}; filename="${downloadName.replace(/"/g, '')}"`
      : undefined
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key:    key,
      ...(disposition ? { ResponseContentDisposition: disposition } : {}),
    })
    return getSignedUrl(this.s3(), cmd, { expiresIn: this.ttl })
  }

  async remove(key: string): Promise<void> {
    try {
      await this.s3().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (e) {
      // Losing a stray object is not worth failing the user's action for
      this.logger.warn(`Could not delete ${key}: ${e}`)
    }
  }
}
