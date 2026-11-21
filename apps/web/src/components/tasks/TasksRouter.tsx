'use client'

import { useAuth } from '@/contexts/AuthContext'
import TasksPage from '@/components/tasks/TasksPage'
import AuditPage from '@/components/audit/AuditPage'

// Tasks and Task Approval are the same pages for both halves of the firm. The
// department decides what is inside them, not which menu item exists: Asif
// Associates is one organisation, so an audit manager finds their work where a
// tax manager finds theirs rather than under a separate section.
export default function TasksRouter(props: {
  role?: string
  defaultManagerView?: 'my' | 'approval'
  completedOnly?: boolean
  incompleteOnly?: boolean
}) {
  const { user } = useAuth()
  const isAuditOnly = user?.division === 'AUDIT'
    && user?.role !== 'ADMIN' && user?.role !== 'PARTNER'

  if (isAuditOnly) {
    return (
      <AuditPage
        approvalOnly={props.defaultManagerView === 'approval'}
        completedOnly={props.completedOnly}
      />
    )
  }
  return <TasksPage {...(props as any)} />
}
