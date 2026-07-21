'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { formatTime12h } from '@/lib/utils'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, border, fill, textColor }: { label: string; value: number; border: string; fill: string; textColor: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: textColor, fontFamily: '"Aptos", sans-serif' }}>{value ?? 0}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// ── Unified attendance table ──────────────────────────────────────────────────
function AttendanceTable({ present, absent, leave }: { present: any[]; absent: any[]; leave: any[] }) {
  const roleStyle = (role: string) =>
    role === 'PARTNER'  ? { bg: '#FEF3C7', color: '#92400E' } :
    role === 'MANAGER'  ? { bg: '#DBEAFE', color: '#1D4ED8' } :
    role === 'ADMIN'    ? { bg: '#E0E7FF', color: '#3730A3' } :
    role === 'TEAM_LEAD'? { bg: '#D1FAE5', color: '#065F46' } :
    { bg: '#CFFAFE', color: '#0E7490' }

  const statusStyle = (status: string) =>
    status === 'PRESENT' ? { bg: '#E6F4F6', color: P.teal,    label: 'Present' } :
    status === 'LATE'    ? { bg: '#FFF3E0', color: P.brick,   label: 'Late'    } :
    status === 'ABSENT'  ? { bg: '#FFEBEE', color: '#C62828', label: 'Absent'  } :
    status === 'LEAVE'   ? { bg: '#E3F2FD', color: '#1565C0', label: 'Leave'   } :
    status === 'HOLIDAY' ? { bg: '#F3E5F5', color: '#6A1B9A', label: 'Holiday' } :
    { bg: '#F5F5F5', color: '#9E9E9E', label: status }

  const tdBase: React.CSSProperties = {
    padding: '6px 14px', borderBottom: '1px solid #F1F5F9',
    fontSize: 13, fontFamily: '"Aptos", sans-serif', color: P.navy,
  }

  const sections = [
    { users: present, label: 'Present', count: present.length, borderColor: P.teal,  bgColor: '#EAF5F7' },
    { users: absent,  label: 'Absent',  count: absent.length,  borderColor: '#DC2626', bgColor: '#FEF2F2' },
    { users: leave,   label: 'Leave / Holiday', count: leave.length, borderColor: '#1565C0', bgColor: '#EBF3FD' },
  ].filter(s => s.count > 0)

  if (sections.length === 0) return null

  let globalIdx = 0

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
        {/* Single column header */}
        <thead>
          <tr style={{ background: '#F2AC18' }}>
            {['#', 'Name', 'Role', 'Login Time', 'Status'].map(h => (
              <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map(sec => (
            <>
              {/* Sub-heading row */}
              <tr key={`sh-${sec.label}`}>
                <td colSpan={5} style={{ padding: '6px 14px', background: sec.bgColor, borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: sec.borderColor, fontFamily: '"Aptos", sans-serif' }}>{sec.label}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: sec.borderColor, background: 'rgba(255,255,255,0.7)', padding: '1px 7px', borderRadius: 99 }}>{sec.count}</span>
                </td>
              </tr>
              {/* Data rows */}
              {sec.users.map(u => {
                const rs = roleStyle(u.role)
                const ss = statusStyle(u.status)
                globalIdx++
                const rowNum = globalIdx
                return (
                  <tr key={u.userId} style={{ background: '#fff', transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                    <td style={{ ...tdBase, fontWeight: 700, color: '#94A3B8', width: 40 }}>{rowNum}</td>
                    <td style={{ ...tdBase, fontWeight: 700 }}>{u.fullName}</td>
                    <td style={tdBase}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: rs.bg, color: rs.color }}>{u.role.replace(/_/g, ' ')}</span>
                    </td>
                    <td style={tdBase}>{formatTime12h(u.loginTime) ?? <span style={{ color: '#94A3B8' }}>N/A</span>}</td>
                    <td style={tdBase}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.color }}>{ss.label}</span>
                        {u.isLate && u.lateMinutes && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: P.brick + '18', color: P.brick, border: `1px solid ${P.brick}40` }}>+{u.lateMinutes}m</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DailyAttendancePage() {
  const [date,    setDate]    = useState(todayStr)
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data: res } = await api.get('/attendance/daily', { params: { date } })
      setData(res.data ?? res)
    } catch { if (!silent) setData(null) } finally { if (!silent) setLoading(false) }
  }, [date])

  useEffect(() => { fetchData() }, [fetchData])
  useAutoRefresh(() => fetchData(true))

  const present: any[] = data?.users?.filter((u: any) => u.status === 'PRESENT' || u.status === 'LATE') ?? []
  const absent:  any[] = data?.users?.filter((u: any) => u.status === 'ABSENT')  ?? []
  const leave:   any[] = data?.users?.filter((u: any) => u.status === 'LEAVE' || u.status === 'HOLIDAY') ?? []

  const summary = {
    total:   data?.users?.length ?? 0,
    present: present.length,
    absent:  absent.length,
    leave:   leave.length,
    late:    data?.users?.filter((u: any) => u.isLate).length ?? 0,
  }

  const dateLabel = (() => {
    try { return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return date }
  })()

  const isWeekend = data && data.dayType === 'WEEKEND'
  const isHoliday = data && data.dayType === 'HOLIDAY'

  return (
    <div style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
          Daily Attendance
        </h1>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
        <StatCard label="Total"   value={summary.total}   border="#0891B2" fill="#A5D8DD" textColor="#111827" />
        <StatCard label="Present" value={summary.present} border="#16A34A" fill="#BBF0D6" textColor="#111827" />
        <StatCard label="Absent"  value={summary.absent}  border="#DC2626" fill="#FECACA" textColor="#111827" />
        <StatCard label="Leave"   value={summary.leave}   border="#1565C0" fill="#BDDAF8" textColor="#111827" />
        <StatCard label="Late"    value={summary.late}    border="#64748B" fill="#D4DAE3" textColor="#111827" />
      </div>

      {/* Filter bar */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: P.teal, borderRadius: 40, padding: '5px 14px' }}>
          <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
            style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', background: 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', colorScheme: 'dark' }} />
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', fontFamily: '"Aptos", sans-serif', whiteSpace: 'nowrap' }}>{dateLabel}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '48px 16px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'inline-block', width: 32, height: 32, border: `4px solid ${P.teal}33`, borderTop: `4px solid ${P.teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 12, fontFamily: '"Aptos", sans-serif' }}>Loading attendance…</p>
          </div>
        ) : !data ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '48px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>Failed to load data.</div>
        ) : isHoliday ? (
          <div style={{ background: '#F3E5F5', borderRadius: 12, border: '1px solid #CE93D8', padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: '0 0 8px' }}>🎉</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#6A1B9A', margin: 0 }}>Company Holiday</p>
            <p style={{ fontSize: 12, color: '#9C4BAF', marginTop: 4 }}>No attendance on this day</p>
          </div>
        ) : isWeekend ? (
          <div style={{ background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: '0 0 8px' }}>🏖️</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#64748B', margin: 0 }}>Weekend</p>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>No attendance on weekends</p>
          </div>
        ) : (
          <>
            <AttendanceTable present={present} absent={absent} leave={leave} />
            {present.length === 0 && absent.length === 0 && leave.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '48px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: '"Aptos", sans-serif', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                {data.isWorkingDay ? 'No attendance data recorded for this date yet.' : 'This date is not configured as a working day.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

