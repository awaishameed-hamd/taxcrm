'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const LEAVE_TYPE_OPTIONS = [
  { value: 'sick',   label: 'Sick Leave'   },
  { value: 'casual', label: 'Casual Leave' },
  { value: 'annual', label: 'Annual Leave' },
  { value: 'exam',   label: 'Exam Leave'   },
  { value: 'other',  label: 'Other'        },
]

const LEAVE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label])
)

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  pending:  { background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1' },
  approved: { background: '#F0FDF4', color: '#16A34A' },
  rejected: { background: '#FEF2F2', color: '#DC2626' },
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function MyLeavesPage() {
  const [leaves,   setLeaves]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)
  const [form,     setForm]     = useState({
    leaveType: 'sick',
    fromDate:  todayStr(),
    toDate:    todayStr(),
    reason:    '',
  })

  const fetchLeaves = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/leaves/my')
      setLeaves(data.data ?? [])
    } catch { /* ignore */ } finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { fetchLeaves() }, [fetchLeaves])
  useAutoRefresh(() => fetchLeaves(true))

  const summary = {
    total:    leaves.length,
    pending:  leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.reason.trim()) return
    setSaving(true)
    try {
      await api.post('/leaves', form)
      showToast('Leave application submitted!', true)
      setShowForm(false)
      setForm({ leaveType: 'sick', fromDate: todayStr(), toDate: todayStr(), reason: '' })
      fetchLeaves()
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to submit', false)
    } finally { setSaving(false) }
  }

  const STAT_CARDS = [
    { label: 'Total',    value: summary.total,    border: '#0891B2', fill: '#A5D8DD', text: '#111827' },
    { label: 'Pending',  value: summary.pending,  border: '#1565C0', fill: '#BDDAF8', text: '#111827' },
    { label: 'Approved', value: summary.approved, border: '#16A34A', fill: '#BBF0D6', text: '#111827' },
    { label: 'Rejected', value: summary.rejected, border: '#DC2626', fill: '#FECACA', text: '#111827' },
  ]

  return (
    <div style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 18, right: 22, zIndex: 9999,
          padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13,
          background: toast.ok ? '#16A34A' : '#DC2626', color: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
          My Leaves
        </h1>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: P.teal, color: '#fff',
            fontSize: 13, fontWeight: 700, fontFamily: '"Aptos", sans-serif',
          }}
        >
          <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Apply for Leave
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {STAT_CARDS.map(c => (
          <div key={c.label} style={{ flex: 1, minWidth: 100, background: c.fill, border: `1px solid ${c.border}30`, borderRadius: 10, padding: '11px 14px' }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: c.text, fontFamily: '"Aptos", sans-serif' }}>{c.value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* History table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 750 }}>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                {['#', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Reviewed By', 'Rejection Reason'].map(h => (
                  <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>Loading…</td></tr>
              ) : leaves.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>No leave applications yet. Click "Apply for Leave" to submit one.</td></tr>
              ) : leaves.map((l, i) => (
                <tr key={l.id}
                  style={{ borderBottom: '1px solid #F1F5F9', background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#94A3B8', fontFamily: '"Aptos", sans-serif' }}>{i + 1}</td>
                  <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: P.navy, fontFamily: '"Aptos", sans-serif' }}>{LEAVE_TYPE_LABELS[l.leaveType] ?? l.leaveType}</td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#374151', fontFamily: '"Aptos", sans-serif', whiteSpace: 'nowrap' }}>{l.fromDate?.split('T')[0] ?? ''}</td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#374151', fontFamily: '"Aptos", sans-serif', whiteSpace: 'nowrap' }}>{l.toDate?.split('T')[0] ?? ''}</td>
                  <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: P.navy, fontFamily: '"Aptos", sans-serif' }}>{l.days}</td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Aptos", sans-serif' }}>{l.reason}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, fontFamily: '"Aptos", sans-serif', textTransform: 'capitalize', ...(STATUS_BADGE[l.status] ?? {}) }}>
                      {l.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#64748B', fontFamily: '"Aptos", sans-serif' }}>
                    {l.reviewedBy ? `${l.reviewedBy.fullName} (${l.reviewedBy.role.replace(/_/g, ' ')})` : 'Pending'}
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#DC2626', fontFamily: '"Aptos", sans-serif' }}>
                    {l.rejectionReason ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
                Apply for Leave
              </h2>
              <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#64748B', lineHeight: 1 }}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Leave Type */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 5 }}>Leave Type</label>
                <StyledSelect
                  value={form.leaveType}
                  onChange={val => setForm(f => ({ ...f, leaveType: val }))}
                  options={LEAVE_TYPE_OPTIONS}
                  placeholder="Select leave type..."
                  borderColor="#D7A520"
                />
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 5 }}>From Date</label>
                  <input type="date" value={form.fromDate}
                    onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: '"Aptos", sans-serif' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 5 }}>To Date</label>
                  <input type="date" value={form.toDate}
                    onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: '"Aptos", sans-serif' }} />
                </div>
              </div>

              {/* Reason */}
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 5 }}>Reason</label>
                <textarea
                  rows={3}
                  required
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Enter reason for leave..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: '"Aptos", sans-serif', color: '#1E293B' }} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ padding: '8px 22px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#64748B', fontFamily: '"Aptos", sans-serif' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: P.teal, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1, fontFamily: '"Aptos", sans-serif' }}>
                  {saving ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
