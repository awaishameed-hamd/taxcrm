'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type ExcelJS from 'exceljs'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MODULE_START_YEAR  = 2026
const MODULE_START_MONTH = 1

const labelCls          = 'block text-xs font-bold uppercase tracking-widest mb-0.5'
const selectCls         = 'w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition cursor-pointer'
const inputCls          = 'w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition'
const filterSelectStyle = { background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' } as React.CSSProperties
const filterInputStyle  = { background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' } as React.CSSProperties

function roleLabel(r: string) {
  return r.replace(/_/g, ' ')
}

function statusLabel(s: string) {
  if (s === 'PRESENT') return 'Present'
  if (s === 'LATE')    return 'Late'
  if (s === 'ABSENT')  return 'Absent'
  if (s === 'LEAVE')   return 'Leave'
  if (s === 'HOLIDAY') return 'Holiday'
  return s
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  PRESENT: { bg: '#D1FAE5', color: '#065F46' },
  LATE:    { bg: '#FEF3C7', color: '#92400E' },
  ABSENT:  { bg: '#FEE2E2', color: '#991B1B' },
  LEAVE:   { bg: '#DBEAFE', color: '#1E40AF' },
  HOLIDAY: { bg: '#EDE9FE', color: '#5B21B6' },
}

// ── Per-employee aggregated summary ───────────────────────────────────────────
interface EmpSummary {
  userId:    string
  userName:  string
  userRole:  string
  isActive:  boolean
  present:   number
  late:      number
  absent:    number
  leave:     number
  records:   any[]
}

function buildSummaries(records: any[]): EmpSummary[] {
  const map = new Map<string, EmpSummary>()
  for (const r of records) {
    if (!map.has(r.userId)) {
      map.set(r.userId, { userId: r.userId, userName: r.userName, userRole: r.userRole, isActive: r.isActive ?? true, present: 0, late: 0, absent: 0, leave: 0, records: [] })
    }
    const s = map.get(r.userId)!
    s.records.push(r)
    if (r.status === 'PRESENT')  s.present++
    if (r.status === 'LATE')   { s.late++;  s.present++ }
    if (r.status === 'ABSENT')   s.absent++
    if (r.status === 'LEAVE' || r.status === 'HOLIDAY') s.leave++
  }
  return Array.from(map.values()).sort((a, b) => a.userName.localeCompare(b.userName))
}

// ── Opening Balance Modal ─────────────────────────────────────────────────────
interface OpeningRow { userId: string; userName: string; userRole: string; presents: number; late: number; absents: number; leaves: number; workingDays: number }

function OpeningBalanceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows,    setRows]    = useState<OpeningRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/users', { params: { status: 'active' } }),
      api.get('/attendance/opening'),
    ]).then(([usersRes, openingsRes]) => {
      const users    = (usersRes.data?.data ?? usersRes.data ?? []).filter((u: any) => u.role !== 'CLIENT')
      const openings: Record<string, any> = {}
      ;(openingsRes.data?.data ?? openingsRes.data ?? []).forEach((o: any) => { openings[o.userId] = o })
      setRows(users.map((u: any) => ({
        userId:     u.id,
        userName:   u.fullName,
        userRole:   u.role,
        presents:   openings[u.id]?.presents    ?? 0,
        late:       openings[u.id]?.late        ?? 0,
        absents:    openings[u.id]?.absents     ?? 0,
        leaves:     openings[u.id]?.leaves      ?? 0,
        workingDays:openings[u.id]?.workingDays ?? 0,
      })))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function update(userId: string, field: keyof OpeningRow, val: string) {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setRows(prev => prev.map(r => r.userId === userId ? { ...r, [field]: num } : r))
  }

  async function save() {
    setSaving(true)
    try {
      await Promise.all(rows.map(r =>
        api.put(`/attendance/opening/${r.userId}`, {
          presents: r.presents, late: r.late, absents: r.absents, leaves: r.leaves, workingDays: r.workingDays,
        })
      ))
      setToast('Opening balances saved.')
      setTimeout(() => { onSaved(); onClose() }, 800)
    } catch { setToast('Failed to save.') }
    finally { setSaving(false) }
  }

  const numInput = (row: OpeningRow, field: keyof OpeningRow) => (
    <input
      type="number" min={0} value={row[field] as number}
      onChange={e => update(row.userId, field, e.target.value)}
      style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 12, textAlign: 'center', fontFamily: '"Aptos", sans-serif', color: P.navy, outline: 'none' }}
    />
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(19,46,87,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#F8FAFC', borderRadius: 18, width: '100%', maxWidth: 860, boxShadow: '0 32px 80px rgba(0,0,0,0.28)', marginBottom: 24 }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', background: 'linear-gradient(135deg, #DDE3EC 0%, #D0D8E4 100%)', borderRadius: '18px 18px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${P.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: '"Aptos", sans-serif', fontSize: 17, fontWeight: 900, color: P.navy }}>Opening Details</h2>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 22, color: P.textMuted, lineHeight: 1 }}>×</button>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: P.textMuted, fontSize: 13 }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>
              <thead>
                <tr style={{ background: '#F2AC18', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Name', 'Role', 'Present', 'Late', 'Absent', 'Leave', 'Working Days'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Name' || h === 'Role' ? 'left' : 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1a1a1a', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.userId} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC', borderBottom: `1px solid ${P.border}30` }}>
                    <td style={{ padding: '7px 14px', fontWeight: 700, color: P.navy }}>{r.userName}</td>
                    <td style={{ padding: '7px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#E8EAED', color: P.textMuted }}>{roleLabel(r.userRole)}</span>
                    </td>
                    <td style={{ padding: '7px 14px', textAlign: 'center' }}>{numInput(r, 'presents')}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'center' }}>{numInput(r, 'late')}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'center' }}>{numInput(r, 'absents')}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'center' }}>{numInput(r, 'leaves')}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'center' }}>{numInput(r, 'workingDays')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '0 0 18px 18px' }}>
          <span style={{ fontSize: 12, color: toast.includes('Failed') ? '#DC2626' : '#16A34A', fontFamily: '"Aptos", sans-serif', fontWeight: 600 }}>{toast}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>Cancel</button>
            <button onClick={save} disabled={saving || loading} style={{ padding: '8px 22px', borderRadius: 8, border: 0, background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: '"Aptos", sans-serif' }}>
              {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── All-Time Detail Modal (table view, multi-month) ───────────────────────────
function AllTimeDetailModal({ emp, onClose }: { emp: EmpSummary; onClose: () => void }) {
  // Group records by month label
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>()
    const sorted = [...emp.records].sort((a, b) => a.date.localeCompare(b.date))
    for (const r of sorted) {
      const [y, m] = r.date.split('-')
      const key = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries())
  }, [emp.records])

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ background: '#64748B', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 20, display: 'inline-block', transform: 'skewX(12deg)', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
            {emp.userName}
          </h2>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: '"Aptos", sans-serif' }}>
            {roleLabel(emp.userRole)}
          </span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 600, fontFamily: '"Aptos", sans-serif' }}>
            All Time
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12 }}>
          {[
            { label: 'Present', val: emp.present },
            { label: 'Absent',  val: emp.absent  },
            { label: 'Late',    val: emp.late    },
            { label: 'Leave',   val: emp.leave   },
          ].map(({ label, val }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14, fontFamily: '"Aptos", sans-serif' }}>{val}</span>
              <span style={{ color: '#CBD5E1', fontWeight: 600, fontFamily: '"Aptos", sans-serif' }}>{label}</span>
            </span>
          ))}
          <button onClick={onClose} style={{
            marginLeft: 8, cursor: 'pointer', color: '#E2E8F0', fontWeight: 700,
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8, padding: '4px 12px', fontSize: 12,
            fontFamily: '"Aptos", sans-serif', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            ← Back
          </button>
        </div>
      </div>

      {/* Records table grouped by month */}
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', padding: '16px 20px' }}>
        {grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: P.textMuted, fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>
            No records found.
          </div>
        ) : grouped.map(([monthLabel, recs]) => (
          <div key={monthLabel} style={{ marginBottom: 20 }}>
            {/* Month header */}
            <div style={{
              padding: '5px 12px', background: P.navy, borderRadius: 8, marginBottom: 8,
              fontFamily: '"Aptos", sans-serif', fontSize: 12, fontWeight: 700,
              color: '#F2AC18', letterSpacing: '0.07em', textTransform: 'uppercase',
              display: 'inline-block',
            }}>
              {monthLabel}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Date', 'Day', 'Status', 'Login Time', 'Late Min.', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: `1px solid ${P.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recs.map((r, i) => {
                  const st = STATUS_STYLE[r.status] ?? { bg: '#F3F4F6', color: '#6B7280' }
                  const dayName = DAY_NAMES[new Date(r.date + 'T00:00:00').getDay()]
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC', borderBottom: `1px solid ${P.border}30` }}>
                      <td style={{ padding: '6px 12px', color: P.navy, fontWeight: 600 }}>{r.date}</td>
                      <td style={{ padding: '6px 12px', color: P.textMuted, fontSize: 12 }}>{dayName}</td>
                      <td style={{ padding: '6px 12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td style={{ padding: '6px 12px', color: P.textMuted, fontSize: 12 }}>{r.loginTime ?? ''}</td>
                      <td style={{ padding: '6px 12px', color: r.lateMinutes ? '#d97706' : P.textMuted, fontSize: 12, fontWeight: r.lateMinutes ? 700 : 400 }}>
                        {r.lateMinutes ? `${r.lateMinutes}m` : ''}
                      </td>
                      <td style={{ padding: '6px 12px', color: P.textMuted, fontSize: 12 }}>{r.notes ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Monthly Detail Modal (calendar view) ──────────────────────────────────────
function DetailModal({ emp, month, year, onClose }: { emp: EmpSummary; month: number; year: number; isPartner?: boolean; onClose: () => void }) {
  const { user: authUser } = useAuth()
  const canEdit   = authUser?.role === 'ADMIN' || authUser?.role === 'PARTNER' || authUser?.role === 'MANAGER'
  const canCreate = canEdit
  const [records, setRecords] = useState<any[]>(emp.records)
  const [editId,      setEditId]      = useState<string | null | 'NEW'>(null)
  const [editDate,    setEditDate]    = useState<string>('')
  const [editForm,    setEditForm]    = useState({ status: 'PRESENT', loginTime: '', notes: '' })
  const [saving,      setSaving]      = useState(false)

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay    = new Date(year, month - 1, 1).getDay()

  const sevenDaysAgo = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return d.toISOString().split('T')[0]
  })()
  const todayStr2 = new Date().toISOString().split('T')[0]

  const dayMap = useMemo(() => {
    const m: Record<number, any> = {}
    records.forEach(r => { m[parseInt(r.date.split('-')[2], 10)] = r })
    return m
  }, [records])

  const CAL_MAP: Record<string, { bg: string; pill: string; pillText: string; dayColor: string; label: string }> = {
    PRESENT: { bg: '#bbf7d0', pill: '#16a34a', pillText: '#fff', dayColor: '#14532d', label: 'Present' },
    LATE:    { bg: '#fde68a', pill: '#d97706', pillText: '#fff', dayColor: '#78350f', label: 'Late'    },
    ABSENT:  { bg: '#fecaca', pill: '#dc2626', pillText: '#fff', dayColor: '#7f1d1d', label: 'Absent'  },
    LEAVE:   { bg: '#bfdbfe', pill: '#2563eb', pillText: '#fff', dayColor: '#1e3a8a', label: 'Leave'   },
    HOLIDAY: { bg: '#ddd6fe', pill: '#7c3aed', pillText: '#fff', dayColor: '#4c1d95', label: 'Holiday' },
    WEEKEND: { bg: '#e2e8f0', pill: '#64748b', pillText: '#fff', dayColor: '#475569', label: 'Off'     },
  }
  const todayStr = new Date().toISOString().split('T')[0]

  function openEdit(rec: any) {
    setEditId(rec.id)
    setEditDate('')
    setEditForm({ status: rec.status, loginTime: rec.loginTime ?? '', notes: rec.notes ?? '' })
  }

  function openCreate(dateStr: string) {
    setEditId('NEW')
    setEditDate(dateStr)
    setEditForm({ status: 'PRESENT', loginTime: '', notes: '' })
  }

  async function saveEdit() {
    if (!editId) return
    setSaving(true)
    try {
      const payload: any = { status: editForm.status, notes: editForm.notes || undefined }
      if (editForm.status === 'PRESENT' || editForm.status === 'LATE') {
        payload.loginTime = editForm.loginTime || undefined
        payload.isLate    = editForm.status === 'LATE'
      }
      if (editId === 'NEW') {
        const { data } = await api.post('/attendance/create', { userId: emp.userId, date: editDate, ...payload })
        setRecords(prev => [...prev, { ...data, date: editDate, loginTime: editForm.loginTime }])
      } else {
        await api.patch(`/attendance/${editId}`, payload)
        setRecords(prev => prev.map(r => r.id === editId ? { ...r, ...payload, loginTime: editForm.loginTime || r.loginTime } : r))
      }
      setEditId(null)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const isWeekendDay = (dateStr: string) => {
    const day = new Date(dateStr + 'T00:00:00').getDay()
    return day === 0 || day === 6
  }

  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0, leave = 0
    records.forEach(r => {
      if (r.status === 'PRESENT') present++
      if (r.status === 'LATE')  { late++; present++ }
      if (r.status === 'ABSENT')  absent++
      if (r.status === 'LEAVE' || r.status === 'HOLIDAY') leave++
    })
    return { present, late, absent, leave }
  }, [records])

  return (
    <>
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ background: '#64748B', padding: '10px 20px', borderBottom: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 20, display: 'inline-block', transform: 'skewX(12deg)', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
              {emp.userName}
            </h2>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: '"Aptos", sans-serif' }}>
              {roleLabel(emp.userRole)}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 600, fontFamily: '"Aptos", sans-serif' }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            {canEdit && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.15)', color: '#E2E8F0', fontWeight: 700, border: '1px solid rgba(255,255,255,0.25)', fontFamily: '"Aptos", sans-serif' }}>
                ✎ Edit Mode
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12 }}>
            {[
              { label: 'Present', val: summary.present },
              { label: 'Absent',  val: summary.absent  },
              { label: 'Late',    val: summary.late    },
              { label: 'Leave',   val: summary.leave   },
            ].map(({ label, val }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14, fontFamily: '"Aptos", sans-serif' }}>{val}</span>
                <span style={{ color: '#CBD5E1', fontWeight: 600, fontFamily: '"Aptos", sans-serif' }}>{label}</span>
              </span>
            ))}
            <button onClick={onClose} style={{
              marginLeft: 8, cursor: 'pointer', color: '#E2E8F0', fontWeight: 700,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, padding: '4px 12px', fontSize: 12,
              fontFamily: '"Aptos", sans-serif', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              ← Back
            </button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 8 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} style={{ textAlign: 'center', padding: '7px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: P.navy, fontFamily: '"Aptos", sans-serif', borderBottom: `2px solid ${P.gold}` }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const rec      = dayMap[d]
              const weekend  = !rec && isWeekendDay(dateStr)
              const status   = rec?.status ?? (weekend ? 'WEEKEND' : null)
              const cs       = status ? (CAL_MAP[status] ?? null) : null
              const isToday  = dateStr === todayStr
              const inEditWin = canEdit && dateStr >= sevenDaysAgo && dateStr <= todayStr2

              return (
                <div key={d} style={{ minHeight: 86, borderRadius: 10, background: cs ? cs.bg : '#F8FAFC', border: isToday ? `2px solid ${P.teal}` : '1.5px solid #E2E8F0', boxShadow: isToday ? `0 0 0 3px ${P.teal}18` : '0 1px 2px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '7px 8px 8px', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isToday ? P.teal : (cs?.dayColor ?? '#cbd5e1'), fontFamily: '"Aptos", sans-serif', lineHeight: 1 }}>
                      {isToday
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: P.teal, color: '#fff', fontSize: 11, fontWeight: 900 }}>{d}</span>
                        : d}
                    </span>
                    {cs?.pill && (
                      <span style={{ padding: '2px 7px', borderRadius: 6, background: cs.pill, color: cs.pillText, fontSize: 9, fontWeight: 800, fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {cs.label}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {rec?.loginTime && (
                      <span style={{ fontSize: 16, fontWeight: 900, color: cs?.dayColor ?? P.navy, fontFamily: '"Aptos", sans-serif', letterSpacing: '0.05em' }}>
                        {rec.loginTime}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', minHeight: 18 }}>
                    {rec?.isLate && (
                      <span style={{ padding: '1px 7px', borderRadius: 5, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: 9, fontWeight: 800, fontFamily: '"Aptos", sans-serif' }}>
                        {rec.lateMinutes}m
                      </span>
                    )}
                  </div>
                  {rec?.editedById && (
                    <span style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%', background: P.gold }} title="Edited" />
                  )}
                  {inEditWin && rec && (
                    <button onClick={() => openEdit(rec)} style={{ position: 'absolute', bottom: 5, right: 5, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'rgba(30,132,150,0.12)', color: P.teal, border: `1px solid ${P.teal}55`, cursor: 'pointer', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em', lineHeight: 1.4 }}
                      onMouseEnter={e => { e.currentTarget.style.background = P.teal; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30,132,150,0.12)'; e.currentTarget.style.color = P.teal }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                      </svg>
                      Edit
                    </button>
                  )}
                  {canCreate && dateStr >= sevenDaysAgo && dateStr <= todayStr2 && !rec && (
                    <button onClick={() => openCreate(dateStr)} style={{ position: 'absolute', bottom: 5, right: 5, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'rgba(242,172,24,0.12)', color: '#b45309', border: '1px solid rgba(242,172,24,0.4)', cursor: 'pointer', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em', lineHeight: 1.4 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F2AC18'; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(242,172,24,0.12)'; e.currentTarget.style.color = '#b45309' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {editId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: `1px solid ${P.border}`, overflow: 'hidden' }}>
            <div style={{ background: P.gold, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: '"Aptos", sans-serif', fontWeight: 900, fontSize: 15, color: P.navy, letterSpacing: '0.04em' }}>
                {editId === 'NEW' ? `Add Record: ${editDate}` : 'Edit Record'}
              </span>
              <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.navy, fontSize: 18, lineHeight: 1, fontWeight: 700, padding: '0 2px' }}>×</button>
            </div>
            <div style={{ padding: '20px 20px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.textMuted, fontFamily: '"Aptos", sans-serif', marginBottom: 8 }}>Status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { key: 'PRESENT', label: 'Present', activeBg: P.teal,    activeText: '#fff' },
                    { key: 'LATE',    label: 'Late',    activeBg: '#d97706', activeText: '#fff' },
                    { key: 'ABSENT',  label: 'Absent',  activeBg: '#dc2626', activeText: '#fff' },
                    { key: 'LEAVE',   label: 'Leave',   activeBg: '#2563eb', activeText: '#fff' },
                  ].map(({ key, label, activeBg, activeText }) => {
                    const isActive = editForm.status === key
                    return (
                      <button key={key} onClick={() => setEditForm(f => ({ ...f, status: key }))} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: '"Aptos", sans-serif', cursor: 'pointer', transition: 'all 0.15s', background: isActive ? activeBg : '#F8FAFC', color: isActive ? activeText : P.textMuted, border: isActive ? `1.5px solid ${activeBg}` : `1.5px solid ${P.border}`, boxShadow: isActive ? `0 2px 8px ${activeBg}40` : 'none' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              {(editForm.status === 'PRESENT' || editForm.status === 'LATE') && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.textMuted, fontFamily: '"Aptos", sans-serif', marginBottom: 6 }}>Login Time (24h)</label>
                  <input type="time" value={editForm.loginTime} onChange={e => setEditForm(f => ({ ...f, loginTime: e.target.value }))}
                    style={{ border: `1.5px solid ${P.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, outline: 'none', fontFamily: '"Aptos", sans-serif', color: P.textHeading, background: '#F8FAFC' }} />
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.textMuted, fontFamily: '"Aptos", sans-serif', marginBottom: 6 }}>Notes (optional)</label>
                <input type="text" value={editForm.notes} placeholder="Optional note…" onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ width: '100%', border: `1.5px solid ${P.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: '"Aptos", sans-serif', color: P.textHeading, background: '#F8FAFC', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${P.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#FAFBFC' }}>
              <button onClick={() => setEditId(null)} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1.5px solid ${P.border}`, background: '#fff', color: P.textMuted, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ padding: '9px 22px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: saving ? 'default' : 'pointer', background: `linear-gradient(135deg, ${P.teal} 0%, ${P.deepTeal} 100%)`, color: '#fff', fontFamily: '"Aptos", sans-serif', opacity: saving ? 0.6 : 1, boxShadow: '0 2px 8px rgba(30,132,150,0.3)' }}>
                {saving ? 'Saving…' : editId === 'NEW' ? 'Add Record' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Excel export ───────────────────────────────────────────────────────────────
async function exportExcel(summaries: EmpSummary[], month: number, year: number, viewMode: 'monthly' | 'all') {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CA Firm CRM'
  const ws = wb.addWorksheet('Attendance Report')

  const NAVY_HEX   = '132E57'
  const GOLD_HEX   = 'F2AC18'
  const LIGHT_GOLD = 'FEF3C7'
  const periodLabel = viewMode === 'all' ? 'All Time' : `${MONTH_NAMES[month - 1]} ${year}`

  const cols = [
    { header: '#',                  key: 'no',        width: 6,  isNum: true  },
    { header: 'Name',               key: 'name',      width: 28, isNum: false },
    { header: 'Role',               key: 'role',      width: 18, isNum: false },
    { header: 'Present',            key: 'present',   width: 12, isNum: true  },
    { header: 'Late',               key: 'late',      width: 10, isNum: true  },
    { header: 'Absent',             key: 'absent',    width: 10, isNum: true  },
    { header: 'Leave',              key: 'leave',     width: 10, isNum: true  },
    { header: 'Total Working Days', key: 'totalDays', width: 20, isNum: true  },
  ]

  ws.columns = cols.map(c => ({ key: c.key, width: c.width }))

  ws.mergeCells(1, 1, 1, cols.length)
  const titleCell = ws.getCell('A1')
  titleCell.value = `Attendance Report  |  ${periodLabel}`
  titleCell.font  = { name: 'Aptos', bold: true, size: 14, color: { argb: 'FF' + NAVY_HEX } }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD_HEX } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  ws.mergeCells(2, 1, 2, cols.length)
  const dateCell = ws.getCell('A2')
  dateCell.value = `Exported: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
  dateCell.font  = { name: 'Aptos', size: 10, italic: true, color: { argb: 'FF' + NAVY_HEX } }
  dateCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9EC' } }
  dateCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  const headerRow = ws.getRow(3)
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.header
    cell.font  = { name: 'Aptos', bold: true, size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD_HEX } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + NAVY_HEX } } }
  })
  headerRow.height = 32

  summaries.forEach((s, idx) => {
    const row  = ws.addRow([])
    const bg   = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F9FA'
    const total = s.present + s.absent + s.leave
    const rowData: (string | number)[] = [idx + 1, s.userName, s.userRole, s.present, s.late, s.absent, s.leave, total]
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = rowData[i] as ExcelJS.CellValue
      cell.font  = { name: 'Aptos', size: 10, color: { argb: 'FF' + NAVY_HEX } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.alignment = { horizontal: c.isNum ? 'center' : 'left', vertical: 'middle' }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    })
    row.height = 18
  })

  const totalRow = ws.addRow([])
  const dataStart = 4, dataEnd = 3 + summaries.length
  cols.forEach((c, i) => {
    const cell = totalRow.getCell(i + 1)
    const colLetter = ws.getColumn(i + 1).letter
    if (i === 0)        cell.value = ''
    else if (i === 1)   cell.value = 'TOTAL'
    else if (c.isNum)   cell.value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` }
    cell.font   = { name: 'Aptos', bold: true, size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT_GOLD } }
    cell.alignment = { horizontal: c.isNum ? 'center' : 'left', vertical: 'middle' }
    cell.border = { top: { style: 'medium', color: { argb: 'FF' + GOLD_HEX } } }
  })
  totalRow.height = 20

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }]

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = viewMode === 'all'
    ? `attendance-report-all-time.xlsx`
    : `attendance-report-${year}-${String(month).padStart(2, '0')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AttendanceReportPage({ isPartner = false }: { isPartner?: boolean }) {
  const now      = new Date()
  const nowYear  = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  const { user: authUser } = useAuth()
  const canEditOpening = authUser?.role === 'ADMIN' || authUser?.role === 'PARTNER' || authUser?.role === 'MANAGER'

  const [viewMode,      setViewMode]      = useState<'monthly' | 'all'>('monthly')
  const [month,         setMonth]         = useState(nowMonth)
  const [year,          setYear]          = useState(nowYear)
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<'all' | 'active' | 'inactive'>('active')
  const [records,       setRecords]       = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState<EmpSummary | null>(null)
  const [openings,      setOpenings]      = useState<Record<string, any>>({})
  const [showOpening,   setShowOpening]   = useState(false)

  const fetchOpenings = useCallback(async () => {
    try {
      const { data } = await api.get('/attendance/opening')
      const map: Record<string, any> = {}
      ;(data?.data ?? data ?? []).forEach((o: any) => { map[o.userId] = o })
      setOpenings(map)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchOpenings() }, [fetchOpenings])

  const availableYears = useMemo(() => {
    const arr = []
    for (let y = MODULE_START_YEAR; y <= nowYear; y++) arr.push(y)
    return arr
  }, [nowYear])

  const availableMonths = useMemo(() => {
    const minM = year === MODULE_START_YEAR ? MODULE_START_MONTH : 1
    const maxM = year === nowYear ? nowMonth : 12
    const arr = []
    for (let m = minM; m <= maxM; m++) arr.push(m)
    return arr
  }, [year, nowYear, nowMonth])

  useEffect(() => {
    const minM = year === MODULE_START_YEAR ? MODULE_START_MONTH : 1
    const maxM = year === nowYear ? nowMonth : 12
    if (month < minM) setMonth(minM)
    else if (month > maxM) setMonth(maxM)
  }, [year]) // eslint-disable-line

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setSelected(null)
    try {
      const params: any = viewMode === 'all' ? { mode: 'all' } : { month, year }
      const { data } = await api.get('/attendance/report', { params })
      setRecords(data.data ?? [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [viewMode, month, year])

  useEffect(() => { fetchReport() }, [fetchReport])

  const summaries = useMemo(() => {
    const all = buildSummaries(records)
    const merged = viewMode === 'all'
      ? all.map(s => {
          const ob = openings[s.userId]
          if (!ob) return s
          return {
            ...s,
            present:     s.present + (ob.presents    ?? 0),
            late:        s.late    + (ob.late         ?? 0),
            absent:      s.absent  + (ob.absents      ?? 0),
            leave:       s.leave   + (ob.leaves       ?? 0),
          }
        })
      : all
    const filtered = statusFilter === 'active'   ? merged.filter(s => s.isActive)
                   : statusFilter === 'inactive' ? merged.filter(s => !s.isActive)
                   : merged
    if (!search.trim()) return filtered
    const q = search.toLowerCase()
    return filtered.filter(s => s.userName.toLowerCase().includes(q) || s.userRole.toLowerCase().includes(q))
  }, [records, search, viewMode, openings, statusFilter])

  const pillBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: '4px 14px', borderRadius: 40, border: 'none', cursor: 'pointer',
      fontSize: 12, fontWeight: 700, fontFamily: '"Aptos", sans-serif',
      transition: 'all .15s', whiteSpace: 'nowrap',
      background: active ? P.navy : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,0.85)',
    }}>
      {label}
    </button>
  )

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      {/* Header */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: P.navy }}>
          Attendance Report
        </h1>
        <button onClick={() => exportExcel(summaries, month, year, viewMode)} disabled={loading || summaries.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
          style={{ background: '#16a34a' }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#15803d' }}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export Excel
        </button>
      </div>

      {/* Filters */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px' }}>

          {/* View mode toggle */}
          {pillBtn('Monthly',  viewMode === 'monthly', () => setViewMode('monthly'))}
          {pillBtn('All Time', viewMode === 'all',     () => setViewMode('all'))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Status filter pills */}
          {(['all', 'active', 'inactive'] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', whiteSpace: 'nowrap',
              background: statusFilter === v ? P.navy : 'transparent',
              color: statusFilter === v ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Month + Year — only in monthly mode */}
          {viewMode === 'monthly' && (<>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', background: 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', appearance: 'none', paddingRight: 24, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
              {availableMonths.map(m => <option key={m} value={m} style={{ background: P.navy }}>{MONTH_NAMES[m - 1]}</option>)}
            </select>

            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', background: 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', appearance: 'none', paddingRight: 24, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
              {availableYears.map(y => <option key={y} value={y} style={{ background: P.navy }}>{y}</option>)}
            </select>

            {/* Separator */}
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />
          </>)}

          {/* Opening Balance button — All Time + admin/partner only */}
          {viewMode === 'all' && canEditOpening && (
            <button onClick={() => setShowOpening(true)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Aptos", sans-serif',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Opening Details
            </button>
          )}

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 220 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: '"Aptos", sans-serif' }} />
          </div>

          {/* Record count */}
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', paddingRight: 4 }}>
            {summaries.length} employee{summaries.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Opening Balance Modal */}
      {showOpening && (
        <OpeningBalanceModal
          onClose={() => setShowOpening(false)}
          onSaved={() => { fetchOpenings() }}
        />
      )}

      {/* Detail view */}
      {selected && viewMode === 'monthly' && (
        <DetailModal emp={selected} month={month} year={year} onClose={() => setSelected(null)} />
      )}
      {selected && viewMode === 'all' && (
        <AllTimeDetailModal emp={selected} onClose={() => setSelected(null)} />
      )}

      {/* Summary table */}
      {!selected && (
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: '#F2AC18' }}>
                  {['#','Name','Role','Present','Late','Absent','Leave','Working Days',''].map(h => (
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
                ) : summaries.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '48px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: '"Aptos", sans-serif' }}>
                      {viewMode === 'all'
                        ? 'No attendance records found.'
                        : `No attendance records found for ${MONTH_NAMES[month - 1]} ${year}.`}
                    </td>
                  </tr>
                ) : summaries.map((s, idx) => {
                  const roleStyle = s.userRole === 'PARTNER'
                    ? { bg: '#FEF3C7', color: '#92400E' }
                    : s.userRole === 'MANAGER' ? { bg: '#DBEAFE', color: '#1D4ED8' } : { bg: '#CFFAFE', color: '#0E7490' }
                  const workingDays = s.present + s.absent + s.leave
                  const tdBase: React.CSSProperties = { padding: '6px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13, fontFamily: '"Aptos", sans-serif' }
                  return (
                    <tr key={s.userId} style={{ background: '#fff', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                      <td style={{ ...tdBase, fontWeight: 700, color: '#94A3B8', width: 40 }}>{idx + 1}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: P.navy }}>{s.userName}</td>
                      <td style={tdBase}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: roleStyle.bg, color: roleStyle.color }}>{roleLabel(s.userRole)}</span>
                      </td>
                      <td style={{ ...tdBase, fontWeight: 700, color: P.teal }}>{s.present}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: P.brick }}>{s.late}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: '#DC2626' }}>{s.absent}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: '#1565C0' }}>{s.leave}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: '#475569' }}>{workingDays}</td>
                      <td style={tdBase}>
                        <button onClick={() => setSelected(s)}
                          style={{ padding: '3px 12px', borderRadius: 6, border: `1px solid ${P.teal}`, background: 'transparent', color: P.teal, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Aptos", sans-serif' }}>
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
