'use client'

import { useAuth } from '@/contexts/AuthContext'
import DeptToggle, { useDeptView } from '@/components/ui/DeptToggle'
import TasksPage from '@/components/tasks/TasksPage'
import AuditPage from '@/components/audit/AuditPage'

// Tasks and Task Approval are the same pages for both halves of the firm. The
// department decides what is inside them, not which menu item exists: Asif
// Associates is one organisation, so an audit manager finds their work where a
// tax manager finds theirs rather than under a separate section.
//
// Admin and the Director sit above both departments, so they get a Tax / Audit
// switch in the pills row and the page swaps underneath it. Everyone else is in
// one department and never sees the switch.
export default function TasksRouter(props: {
  role?: string
  defaultManagerView?: 'my' | 'approval'
  completedOnly?: boolean
  incompleteOnly?: boolean
}) {
  const { user } = useAuth()
  const { dept, setDept, canSwitch } = useDeptView()

  const isAuditOnly = user?.division === 'AUDIT'
    && user?.role !== 'ADMIN' && user?.role !== 'PARTNER'

  const deptSwitch = canSwitch
    ? <DeptToggle value={dept} onChange={setDept} labels={{ tax: 'Tax', audit: 'Audit' }} />
    : undefined

  if (isAuditOnly || (canSwitch && dept === 'AUDIT')) {
    return (
      <AuditPage
        approvalOnly={props.defaultManagerView === 'approval' && !props.completedOnly && !props.incompleteOnly}
        completedOnly={props.completedOnly}
        incompleteOnly={props.incompleteOnly}
        deptSwitch={deptSwitch}
      />
    )
  }
  return <TasksPage {...(props as any)} deptSwitch={deptSwitch} />
}
