import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// NOTE: not exported by @ca-firm/shared, the client portal's tax-return tracker
// (client dashboard, StatusBadge) predates the SalesTaxTask/FbrCase model and was
// never rewired to it. Kept locally so the build compiles; the underlying feature
// still needs to be reconnected to real data.
export enum TaxReturnStatus {
  DATA_AWAITED     = 'DATA_AWAITED',
  DATA_RECEIVED    = 'DATA_RECEIVED',
  IN_PROGRESS      = 'IN_PROGRESS',
  UNDER_REVIEW     = 'UNDER_REVIEW',
  PSID_GENERATED   = 'PSID_GENERATED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  COMPLETED        = 'COMPLETED',
}

export const TAX_RETURN_STATUS_LABELS: Record<TaxReturnStatus, string> = {
  [TaxReturnStatus.DATA_AWAITED]:     'Data Awaited',
  [TaxReturnStatus.DATA_RECEIVED]:    'Data Received',
  [TaxReturnStatus.IN_PROGRESS]:      'In Progress',
  [TaxReturnStatus.UNDER_REVIEW]:     'Under Review',
  [TaxReturnStatus.PSID_GENERATED]:   'PSID Generated',
  [TaxReturnStatus.PAYMENT_RECEIVED]: 'Payment Received',
  [TaxReturnStatus.COMPLETED]:        'Completed',
}

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

// Display-only: converts a raw "HH:MM" (24h) time string to 12-hour with AM/PM.
// Never use this for values fed into <input type="time">, which always requires 24h "HH:MM".
export function formatTime12h(time: string | null | undefined): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
