'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const labelCls     = 'block text-xs font-bold uppercase tracking-widest mb-1'
const inputCls     = 'rounded-lg px-3 py-1.5 text-sm outline-none transition'
const filterStyle  = { background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' } as React.CSSProperties

const STATUS_TABS = [
  { key: 'all',      label: 'All'      },
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const APPROVAL_BADGE: Record<string, string> = {
  pending:  'border border-gray-300 text-gray-500',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, border, fill, textColor }: { label: string; value: number; border: string; fill: string; textColor: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: textColor, fontFamily: '"Aptos", sans-serif' }}>{value ?? 0}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// ── Inline login-time edit ─────────────────────────────────────────────────────
function EditTimeCell({ rec, onSaved }: { rec: any; onSaved: (id: string, time: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [time,    setTime]    = useState(rec.loginTime ?? '')
  const [saving,  setSaving]  = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/attendance/${rec.id}`, { loginTime: time })
      onSaved(rec.id, time)
      setEditing(false)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        {saving ? (
          <span className="text-xs text-gray-400">Saving…</span>
        ) : (
          <>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="rounded border border-gray-300 px-1.5 py-0.5 text-xs outline-none focus:border-teal-400" />
            <button onClick={save}
              className="px-2 py-0.5 rounded bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-gray-700" style={{ fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em' }}>
        {rec.loginTime ?? 'N/A'}
      </span>
      {rec.approvalStatus === 'pending' && (
        <button onClick={() => setEditing(true)}
          className="px-2 py-0.5 rounded border border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
          Edit
        </button>
      )}
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AttendanceApprovalPage() {
  const [date,      setDate]      = useState(todayStr())
  const [search,    setSearch]    = useState('')
  const [statusTab, setStatusTab] = useState('all')
  const [records,   setRecords]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [confirm,   setConfirm]   = useState<{ id: string; name: string } | null>(null)
  const [acting,    setActing]    = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkActing,  setBulkActing]  = useState(false)

  // ── Leave approval state ───────────────────────────────────────────────────
  const [moduleTab,    setModuleTab]    = useState<'attendance' | 'leaves'>('attendance')
  const [leaveRecords, setLeaveRecords] = useState<any[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [leaveSTab,    setLeaveSTab]    = useState('pending')
  const [leaveSearch,  setLeaveSearch]  = useState('')
  const [leaveConfirm, setLeaveConfirm] = useState<{ id: string; action: 'approve' | 'reject'; name: string } | null>(null)
  const [leaveReason,  setLeaveReason]  = useState('')
  const [leaveActing,  setLeaveActing]  = useState(false)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const d    = new Date(date)
      const month = d.getUTCMonth() + 1
      const year  = d.getUTCFullYear()
      const { data } = await api.get('/attendance/report', { params: { month, year } })
      const all: any[] = data.data ?? []
      // filter to selected date only
      setRecords(all.filter(r => r.date === date))
    } catch { /* ignore */ } finally { if (!silent) setLoading(false) }
  }, [date])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchLeaves = useCallback(async (silent = false) => {
    if (!silent) setLeaveLoading(true)
    try {
      const { data } = await api.get('/leaves/all')
      setLeaveRecords(data.data ?? [])
    } catch { /* ignore */ } finally { if (!silent) setLeaveLoading(false) }
  }, [])

  useEffect(() => { if (moduleTab === 'leaves') fetchLeaves() }, [moduleTab, fetchLeaves])

  useAutoRefresh(() => {
    fetchData(true)
    if (moduleTab === 'leaves') fetchLeaves(true)
  })

  // Client-side filter
  const filtered = useMemo(() => {
    let list = records
    if (statusTab !== 'all') list = list.filter(r => r.approvalStatus === statusTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => r.userName?.toLowerCase().includes(q))
    }
    return list
  }, [records, statusTab, search])

  // Summary counts
  const summary = useMemo(() => ({
    total:    records.length,
    pending:  records.filter(r => r.approvalStatus === 'pending').length,
    approved: records.filter(r => r.approvalStatus === 'approved').length,
    rejected: records.filter(r => r.approvalStatus === 'rejected').length,
    late:     records.filter(r => r.isLate).length,
  }), [records])

  async function doAction() {
    if (!confirm) return
    setActing(true)
    try {
      await api.patch(`/attendance/${confirm.id}/reject`)
      setRecords(prev => prev.map(r => r.id === confirm.id
        ? { ...r, approvalStatus: 'rejected', status: 'ABSENT', isLate: false, lateMinutes: null }
        : r
      ))
      setConfirm(null)
    } catch { setConfirm(null) } finally { setActing(false) }
  }

  // Approve is a one-click action — no confirmation popup (unlike Mark Absent, which still overrides the logged-in status)
  async function approveDirect(id: string) {
    try {
      await api.patch(`/attendance/${id}/approve`)
      setRecords(prev => prev.map(r => r.id === id ? { ...r, approvalStatus: 'approved' } : r))
    } catch { /* ignore */ }
  }

  function onTimeSaved(id: string, newTime: string) {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, loginTime: newTime } : r))
  }

  async function doLeaveAction() {
    if (!leaveConfirm) return
    setLeaveActing(true)
    try {
      if (leaveConfirm.action === 'approve') {
        await api.patch(`/leaves/${leaveConfirm.id}/approve`)
      } else {
        await api.patch(`/leaves/${leaveConfirm.id}/reject`, { reason: leaveReason || undefined })
      }
      setLeaveRecords(prev => prev.map(l => l.id === leaveConfirm.id
        ? { ...l, status: leaveConfirm.action === 'approve' ? 'approved' : 'rejected' }
        : l
      ))
      setLeaveConfirm(null)
      setLeaveReason('')
    } catch { /* ignore */ } finally { setLeaveActing(false) }
  }

  const leaveFiltered = leaveRecords.filter(l => {
    if (leaveSTab !== 'all' && l.status !== leaveSTab) return false
    if (leaveSearch.trim()) {
      const q = leaveSearch.toLowerCase()
      return (l.applicant?.fullName?.toLowerCase() ?? '').includes(q)
        || (l.applicant?.userCode?.toLowerCase() ?? '').includes(q)
    }
    return true
  })

  const leaveSummary = {
    total:    leaveRecords.length,
    pending:  leaveRecords.filter(l => l.status === 'pending').length,
    approved: leaveRecords.filter(l => l.status === 'approved').length,
    rejected: leaveRecords.filter(l => l.status === 'rejected').length,
  }

  const pendingRecords = useMemo(() => records.filter(r => r.approvalStatus === 'pending'), [records])

  async function doBulkApprove() {
    setBulkActing(true)
    try {
      await Promise.all(pendingRecords.map(r => api.patch(`/attendance/${r.id}/approve`)))
      setRecords(prev => prev.map(r =>
        r.approvalStatus === 'pending' ? { ...r, approvalStatus: 'approved' } : r
      ))
      setBulkConfirm(false)
    } catch { /* ignore */ } finally { setBulkActing(false) }
  }

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      {/* Header */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: P.navy }}>
          {moduleTab === 'attendance' ? 'Attendance Approval' : 'Leave Approvals'}
        </h1>
        {/* Module tabs */}
        <div style={{ display: 'flex', gap: 2, background: P.navy + '15', borderRadius: 10, padding: 4 }}>
          {[{ key: 'attendance', label: 'Attendance' }, { key: 'leaves', label: 'Leave Approvals' }].map(m => (
            <button key={m.key} onClick={() => setModuleTab(m.key as 'attendance' | 'leaves')}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: '"Aptos", sans-serif',
                background: moduleTab === m.key ? P.navy : 'transparent',
                color: moduleTab === m.key ? '#fff' : P.navy,
                transition: 'all .15s',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {moduleTab === 'attendance' && (<>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
        <StatCard label="Total Records" value={summary.total}    border="#0891B2" fill="#A5D8DD" textColor="#111827" />
        <StatCard label="Pending"       value={summary.pending}  border="#1565C0" fill="#BDDAF8" textColor="#111827" />
        <StatCard label="Late"          value={summary.late}     border="#64748B" fill="#D4DAE3" textColor="#111827" />
        <StatCard label="Approved"      value={summary.approved} border="#16A34A" fill="#BBF0D6" textColor="#111827" />
        <StatCard label="Rejected"      value={summary.rejected} border="#DC2626" fill="#FECACA" textColor="#111827" />
      </div>

      {/* Filters */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>

          {/* Date */}
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', background: date ? P.navy : 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', colorScheme: 'dark' }} />

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Status pills */}
          {STATUS_TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setStatusTab(key)}
              style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', transition: 'all .15s', whiteSpace: 'nowrap', background: statusTab === key ? P.navy : 'transparent', color: statusTab === key ? '#fff' : 'rgba(255,255,255,0.85)' }}>
              {label}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 220 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: '"Aptos", sans-serif' }} />
          </div>

          {/* Bulk Approve — right corner */}
          <button
            onClick={() => pendingRecords.length > 0 && setBulkConfirm(true)}
            disabled={pendingRecords.length === 0 || loading}
            style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 30, border: 'none', cursor: pendingRecords.length > 0 ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700, fontFamily: '"Aptos", sans-serif', background: pendingRecords.length > 0 ? '#F2AC18' : 'rgba(0,0,0,0.2)', color: '#ffffff', opacity: pendingRecords.length === 0 ? 0.5 : 1 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Approve All Pending
            {pendingRecords.length > 0 && (
              <span style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 99, padding: '1px 7px', fontSize: 11, fontWeight: 900 }}>
                {pendingRecords.length}
              </span>
            )}
          </button>

        </div>
      </div>


      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#F2AC18' }}>
                {['#','Name','Role','Date','Login Time','Status','Late','Approval','Actions'].map(h => (
                  <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.07em', whiteSpace: 'nowrap', background: 'transparent' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                    {Array.from({ length: 9 }).map((_, c) => (
                      <td key={c} style={{ padding: '6px 14px', borderBottom: '1px solid #F1F5F9' }}>
                        <div style={{ height: 12, background: '#F1F5F9', borderRadius: 4, width: '75%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>
                    No records found.
                  </td>
                </tr>
              ) : filtered.map((rec, idx) => {
                const isPending = rec.approvalStatus === 'pending'
                const roleStyle = rec.userRole === 'PARTNER'
                  ? { bg: '#FEF3C7', color: '#92400E' }
                  : rec.userRole === 'MANAGER' ? { bg: '#DBEAFE', color: '#1D4ED8' } : { bg: '#CFFAFE', color: '#0E7490' }
                const attStyle =
                  rec.status === 'PRESENT' ? { bg: '#E6F4F6', color: '#0E7490' } :
                  rec.status === 'LATE'    ? { bg: '#FEF3C7', color: '#B45309' } :
                  rec.status === 'ABSENT'  ? { bg: '#FEE2E2', color: '#DC2626' } :
                  rec.status === 'LEAVE'   ? { bg: '#DBEAFE', color: '#1565C0' } : { bg: '#F3F4F6', color: '#6B7280' }
                const apprStyle =
                  rec.approvalStatus === 'approved' ? { bg: '#F0FDF4', color: '#16A34A' } :
                  rec.approvalStatus === 'rejected'  ? { bg: '#FEF2F2', color: '#DC2626' } : { bg: '#F1F5F9', color: '#64748B' }
                const tdStyle: React.CSSProperties = { padding: '6px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13, fontFamily: '"Aptos", sans-serif', color: P.navy }
                return (
                  <tr key={rec.id} style={{ background: '#fff', transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: '#94A3B8', width: 40 }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{rec.userName}</td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: roleStyle.bg, color: roleStyle.color }}>{rec.userRole.replace(/_/g, ' ')}</span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{rec.date}</td>
                    <td style={tdStyle}><EditTimeCell rec={rec} onSaved={onTimeSaved} /></td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: attStyle.bg, color: attStyle.color }}>{rec.status}</span>
                    </td>
                    <td style={tdStyle}>
                      {rec.isLate
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: P.brick + '18', color: P.brick, border: `1px solid ${P.brick}40` }}>{rec.lateMinutes}m</span>
                        : <span style={{ fontSize: 12, color: '#94A3B8' }}>No</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: apprStyle.bg, color: apprStyle.color }}>{rec.approvalStatus}</span>
                    </td>
                    <td style={tdStyle}>
                      {isPending && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => approveDirect(rec.id)}
                            style={{ padding: '3px 10px', borderRadius: 6, background: '#16A34A', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>
                            Approve
                          </button>
                          <button onClick={() => setConfirm({ id: rec.id, name: rec.userName })}
                            style={{ padding: '3px 10px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>
                            Mark Absent
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      </>)} {/* end attendance section */}

      {moduleTab === 'leaves' && (<>

        {/* Leave Stat cards */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
          <StatCard label="Total"    value={leaveSummary.total}    border="#0891B2" fill="#A5D8DD" textColor="#111827" />
          <StatCard label="Pending"  value={leaveSummary.pending}  border="#1565C0" fill="#BDDAF8" textColor="#111827" />
          <StatCard label="Approved" value={leaveSummary.approved} border="#16A34A" fill="#BBF0D6" textColor="#111827" />
          <StatCard label="Rejected" value={leaveSummary.rejected} border="#DC2626" fill="#FECACA" textColor="#111827" />
        </div>

        {/* Leave Filters */}
        <div style={{ flexShrink: 0, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>
            {STATUS_TABS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setLeaveSTab(key)}
                style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', transition: 'all .15s', whiteSpace: 'nowrap', background: leaveSTab === key ? P.navy : 'transparent', color: leaveSTab === key ? '#fff' : 'rgba(255,255,255,0.85)' }}>
                {label}
              </button>
            ))}
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />
            <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 220 }}>
              <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input type="text" placeholder="Search…" value={leaveSearch} onChange={e => setLeaveSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: '"Aptos", sans-serif' }} />
            </div>
            <button onClick={() => fetchLeaves()} disabled={leaveLoading}
              style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Aptos", sans-serif', background: 'rgba(255,255,255,0.2)', color: '#fff', opacity: leaveLoading ? 0.6 : 1 }}>
              {leaveLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Leave Table */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: '#F2AC18' }}>
                  {['#', 'Applicant', 'Role', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.07em', whiteSpace: 'nowrap', background: 'transparent' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaveLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, c) => (
                        <td key={c} style={{ padding: '8px 14px', borderBottom: '1px solid #F1F5F9' }}>
                          <div style={{ height: 12, background: '#F1F5F9', borderRadius: 4, width: '75%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : leaveFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>
                      No leave applications found.
                    </td>
                  </tr>
                ) : leaveFiltered.map((l, idx) => {
                  const roleStyle = l.applicant?.role === 'PARTNER'
                    ? { bg: '#FEF3C7', color: '#92400E' }
                    : l.applicant?.role === 'MANAGER' ? { bg: '#DBEAFE', color: '#1D4ED8' }
                    : l.applicant?.role === 'TEAM_LEAD' ? { bg: '#F0FDF4', color: '#15803D' }
                    : { bg: '#CFFAFE', color: '#0E7490' }
                  const statusStyle =
                    l.status === 'approved' ? { bg: '#F0FDF4', color: '#16A34A' } :
                    l.status === 'rejected'  ? { bg: '#FEF2F2', color: '#DC2626' } :
                    { bg: '#F1F5F9', color: '#64748B' }
                  const tdS: React.CSSProperties = { padding: '7px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13, fontFamily: '"Aptos", sans-serif', color: P.navy }
                  return (
                    <tr key={l.id} style={{ background: '#fff', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                      <td style={{ ...tdS, color: '#94A3B8', width: 36 }}>{idx + 1}</td>
                      <td style={{ ...tdS, fontWeight: 700 }}>{l.applicant?.fullName}</td>
                      <td style={tdS}>
                        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: roleStyle.bg, color: roleStyle.color }}>{l.applicant?.role?.replace(/_/g, ' ')}</span>
                      </td>
                      <td style={{ ...tdS, textTransform: 'capitalize' }}>{l.leaveType}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{l.fromDate?.split('T')[0]}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{l.toDate?.split('T')[0]}</td>
                      <td style={{ ...tdS, fontWeight: 700 }}>{l.days}</td>
                      <td style={{ ...tdS, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason}</td>
                      <td style={tdS}>
                        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: statusStyle.bg, color: statusStyle.color, textTransform: 'capitalize' }}>{l.status}</span>
                      </td>
                      <td style={tdS}>
                        {l.status === 'pending' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button onClick={() => setLeaveConfirm({ id: l.id, action: 'approve', name: l.applicant?.fullName })}
                              style={{ padding: '3px 10px', borderRadius: 6, background: '#16A34A', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>
                              Approve
                            </button>
                            <button onClick={() => { setLeaveConfirm({ id: l.id, action: 'reject', name: l.applicant?.fullName }); setLeaveReason('') }}
                              style={{ padding: '3px 10px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </>)} {/* end leaves section */}

      {/* Bulk Approve confirm dialog */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !bulkActing && setBulkConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center border border-gray-200">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, #15803d, #16a34a)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-2" style={{ fontFamily: '"Aptos", sans-serif' }}>
              Approve All Pending
            </h3>
            <p className="text-sm text-gray-500 mb-1">
              You are about to approve
            </p>
            <p className="text-2xl font-black mb-1" style={{ color: '#15803d', fontFamily: '"Aptos", sans-serif' }}>
              {pendingRecords.length} record{pendingRecords.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-400 mb-5">for {date}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setBulkConfirm(false)} disabled={bulkActing}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={doBulkApprove} disabled={bulkActing}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(90deg, #15803d, #16a34a)' }}>
                {bulkActing ? 'Approving…' : 'Approve All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog — Mark Absent only; Approve is now a direct one-click action */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !acting && setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center border border-gray-200">
            <div className="text-4xl mb-3">🚫</div>
            <h3 className="text-base font-bold text-gray-800 mb-2">Mark as Absent</h3>
            <p className="text-sm text-gray-500 mb-5">
              Mark {confirm.name} as Absent? This will override their logged-in attendance.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirm(null)} disabled={acting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={doAction} disabled={acting}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 bg-red-600 text-white hover:bg-red-700">
                {acting ? 'Processing…' : 'Mark Absent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave confirm dialog */}
      {leaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !leaveActing && setLeaveConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-gray-200">
            <div className="text-3xl mb-3 text-center">{leaveConfirm.action === 'approve' ? '✅' : '🚫'}</div>
            <h3 className="text-base font-bold text-gray-800 mb-2 text-center" style={{ fontFamily: '"Aptos", sans-serif' }}>
              {leaveConfirm.action === 'approve' ? 'Approve Leave' : 'Reject Leave'}
            </h3>
            <p className="text-sm text-gray-500 mb-4 text-center">
              {leaveConfirm.action === 'approve'
                ? `Approve leave application for ${leaveConfirm.name}?`
                : `Reject leave application for ${leaveConfirm.name}?`}
            </p>
            {leaveConfirm.action === 'reject' && (
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Rejection Reason (optional)</label>
                <textarea
                  rows={2}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="Enter reason…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none resize-none focus:border-red-400"
                  style={{ fontFamily: '"Aptos", sans-serif' }}
                />
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => setLeaveConfirm(null)} disabled={leaveActing}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={doLeaveAction} disabled={leaveActing}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 text-white ${leaveConfirm.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {leaveActing ? 'Processing…' : leaveConfirm.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

