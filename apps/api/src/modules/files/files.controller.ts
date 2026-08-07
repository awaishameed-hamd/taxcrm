import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Response } from 'express'
import { FilesService } from './files.service'
import { StorageService, StorageFolder, STORAGE_FOLDERS, isLegacyPath } from '../storage/storage.service'

@Controller('files')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(private svc: FilesService, private storage: StorageService) {}

  @Get()
  getFolders(@Req() req: any, @Query('clientId') clientId: string, @Query('taxType') taxType: string) {
    return this.svc.getFolders(clientId, taxType ?? 'SALES_TAX', req.user.id, req.user.role)
  }

  // Hand the browser a short-lived link to upload straight to B2. The file never
  // passes through this server, so a big upload costs the VPS nothing.
  @Post('presign-upload')
  async presignUpload(@Body() body: { fileName?: string; contentType?: string; folder?: StorageFolder }) {
    const folder: StorageFolder = STORAGE_FOLDERS.includes(body?.folder as any)
      ? (body.folder as StorageFolder)
      : 'misc'
    const key       = this.storage.buildKey(folder, body?.fileName ?? '')
    const uploadUrl = await this.storage.presignUpload(key, body?.contentType)
    return { key, uploadUrl }
  }

  // Opening a file redirects to a short-lived B2 link, so the bytes travel from
  // Backblaze straight to the browser and never through the VPS.
  @Get('open')
  async open(
    @Query('key') key: string,
    @Query('name') name: string | undefined,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    if (!key) return res.status(400).send('Missing key')
    // Files uploaded before B2 still live on disk and are served the old way
    if (isLegacyPath(key)) return res.redirect(key)

    const url = await this.storage.presignDownload(key, name, download !== 'true')
    return res.redirect(url)
  }
}
