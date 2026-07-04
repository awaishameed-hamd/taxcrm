import { TaxReturnStatus } from '@ca-firm/shared'
import { cn, getStatusLabel, STATUS_BADGE_CLASSES } from '@/lib/utils'

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
