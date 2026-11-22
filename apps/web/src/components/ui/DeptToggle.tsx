'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'

export type Dept = 'TAX' | 'AUDIT' | 'ALL'

const KEY = 'ca_dept_view'

// Admin and the Director carry both halves of the firm, so every page that can
// show either department needs one switch. Everyone else belongs to a single
// department and gets no switch at all, only their own side.
//
// The choice is remembered in localStorage so it follows them from Tasks to the
// Dashboard to Attendance rather than resetting on every page.
//
// `allowAll` is for the pages where both departments can sit in one list, such
// as Attendance. Tasks cannot: a tax task and an audit task run on different
// pills, so there All falls back to Tax.
// `includeManagers` is for the pages a manager is also allowed to look across,
// such as Client Ledgers. They open on their own department, not on everything.
export function useDeptView(opts?: { allowAll?: boolean; includeManagers?: boolean }) {
  const allowAll = opts?.allowAll === true
  const { user } = useAuth()
  const runsBoth  = user?.role === 'ADMIN' || user?.role === 'PARTNER'
  const canSwitch = runsBoth || (opts?.includeManagers === true && user?.role === 'MANAGER')
  const ownDept: Dept = user?.division === 'AUDIT' ? 'AUDIT' : 'TAX'

  // Someone who runs both departments starts on everything where a list can
  // hold both, and on Tax where it cannot. A manager starts on their own side.
  const initial: Dept = !canSwitch ? ownDept : runsBoth ? (allowAll ? 'ALL' : 'TAX') : ownDept
  const [dept, setDeptState] = useState<Dept>(initial)

  useEffect(() => {
    if (!canSwitch) { setDeptState(ownDept); return }
    try {
      const v = localStorage.getItem(KEY)
      if (v === 'AUDIT' || v === 'TAX') setDeptState(v)
      else if (v === 'ALL') setDeptState(allowAll ? 'ALL' : 'TAX')
      else setDeptState(runsBoth ? (allowAll ? 'ALL' : 'TAX') : ownDept)
    } catch { /* private mode */ }
  }, [canSwitch, runsBoth, ownDept, allowAll])

  const setDept = useCallback((d: Dept) => {
    setDeptState(d)
    try { localStorage.setItem(KEY, d) } catch { /* private mode */ }
  }, [])

  return { dept, setDept, canSwitch }
}

// The same pill group the Dashboard uses for Charts and Summary, so it reads as
// part of the page rather than a bolted-on control. It never wraps: the rows it
// sits in scroll sideways instead, so no layout loses its height to it.
export default function DeptToggle({ value, onChange, labels, withAll = false }: {
  value: Dept
  onChange: (d: Dept) => void
  labels?: { tax?: string; audit?: string; all?: string }
  withAll?: boolean
}) {
  const opts: { key: Dept; label: string }[] = [
    { key: 'TAX',   label: labels?.tax   ?? 'Tax'   },
    { key: 'AUDIT', label: labels?.audit ?? 'Audit' },
    ...(withAll ? [{ key: 'ALL' as Dept, label: labels?.all ?? 'All' }] : []),
  ]
  return (
    <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3, flexShrink: 0 }}>
      {opts.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          background: value === o.key ? P.teal : 'transparent',
          color: value === o.key ? '#fff' : P.textMuted,
          border: 'none', padding: '5px 13px', borderRadius: 6, fontSize: 11,
          fontWeight: value === o.key ? 600 : 400, cursor: 'pointer',
          whiteSpace: 'nowrap', transition: 'all 0.15s', fontFamily: "'Aptos', sans-serif",
        }}>{o.label}</button>
      ))}
    </div>
  )
}
