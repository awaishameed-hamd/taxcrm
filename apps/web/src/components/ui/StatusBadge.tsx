import { cn, getStatusLabel, STATUS_BADGE_CLASSES, TaxReturnStatus } from '@/lib/utils'

interface Props {
  status:    TaxReturnStatus
  className?: string
}

export default function StatusBadge({ status, className }: Props) {
  return (
    <span className={cn('status-badge', STATUS_BADGE_CLASSES[status], className)}>
      {getStatusLabel(status)}
    </span>
  )
}
