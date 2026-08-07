import api, { FILE_BASE_URL } from './api'

// Files live only on Backblaze B2. The browser uploads straight there and reads
// straight from there through short-lived signed links, so no file ever passes
// through the VPS. What we store in the database is just the object key.

// Folders inside the bucket, one per kind of work, so files stay organised
// instead of landing in a single dump.
export type StorageFolder =
  | 'sales-tax'
  | 'income-tax'
  | 'wht'
  | 'notices-appeals'
  | 'general-tasks'
  | 'chat'
  | 'payment-proofs'
  | 'misc'

// The tax-return tabs map onto their own folders
export function taxFolder(activeTax: string): StorageFolder {
  if (activeTax === 'income_tax') return 'income-tax'
  if (activeTax === 'wht')        return 'wht'
  return 'sales-tax'
}

export interface UploadedFileInfo {
  url:      string   // the stored reference (B2 object key)
  type:     'IMAGE' | 'AUDIO' | 'FILE'
  fileName: string
  mimeType: string
  size:     number
}

// Files uploaded before B2 are still on the server under /uploads/...
function isLegacy(ref: string): boolean {
  return !!ref && ref.startsWith('/uploads/')
}

// Link to open or embed a stored file. For B2 objects this points at the API,
// which answers with a redirect to Backblaze, so the bytes come from Backblaze
// and not from the VPS. Works directly in <img src> and <a href>.
export function fileHref(ref: string, opts?: { name?: string; download?: boolean }): string {
  if (!ref) return ''
  if (isLegacy(ref)) return `${FILE_BASE_URL}${ref}`
  const params = new URLSearchParams({ key: ref })
  if (opts?.name)     params.set('name', opts.name)
  if (opts?.download) params.set('download', 'true')
  return `${api.defaults.baseURL}/files/open?${params.toString()}`
}

function classify(mimeType: string): 'IMAGE' | 'AUDIO' | 'FILE' {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('audio/')) return 'AUDIO'
  return 'FILE'
}

// Ask the API for a one-time upload link, then send the file straight to B2.
export async function uploadFile(file: File | Blob, folder: StorageFolder, fileName?: string): Promise<UploadedFileInfo> {
  const name = fileName ?? (file instanceof File ? file.name : 'file')
  const mime = file.type || 'application/octet-stream'

  const { data } = await api.post('/files/presign-upload', { fileName: name, contentType: mime, folder })
  const { key, uploadUrl } = data?.data ?? data

  const res = await fetch(uploadUrl, {
    method:  'PUT',
    body:    file,
    headers: { 'Content-Type': mime },
  })
  if (!res.ok) throw new Error('Upload failed')

  return { url: key, type: classify(mime), fileName: name, mimeType: mime, size: file.size }
}
