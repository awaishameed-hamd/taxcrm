import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { TaxReturnStatus, TAX_RETURN_STATUS_LABELS } from '@ca-firm/shared'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function getStatusLabel(status: TaxReturnStatus) {
  return TAX_RETURN_STATUS_LABELS[status] ?? status
}

export const STATUS_BADGE_CLASSES: Record<TaxReturnStatus, string> = {
  [TaxReturnStatus.DATA_AWAITED]:     'bg-amber-100 text-amber-700',
  [TaxReturnStatus.DATA_RECEIVED]:    'bg-blue-100 text-blue-700',
  [TaxReturnStatus.IN_PROGRESS]:      'bg-indigo-100 text-indigo-700',
  [TaxReturnStatus.UNDER_REVIEW]:     'bg-purple-100 text-purple-700',
  [TaxReturnStatus.PSID_GENERATED]:   'bg-teal-100 text-teal-700',
  [TaxReturnStatus.PAYMENT_RECEIVED]: 'bg-emerald-100 text-emerald-700',
  [TaxReturnStatus.COMPLETED]:        'bg-green-100 text-green-700',
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
