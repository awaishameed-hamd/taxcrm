'use client'

import { useState, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useAuth } from '@/contexts/AuthContext'
import { formatTime12h } from '@/lib/utils'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const MODULE_START_YEAR  = 2026
const MODULE_START_MONTH = 1

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  present:    { bg: P.deepTeal, color: '#fff',       label: 'Present'    },
  absent:     { bg: '#C62828', color: '#fff',       label: 'Absent'     },
  late:       { bg: P.brick,   color: '#fff',       label: 'Late'       },
  leave:      { bg: '#E3F2FD', color: '#1565C0',    label: 'Leave'      },
  weekend:    { bg: '#E2E8F0', color: '#475569',    label: 'Weekend'    },
  holiday:    { bg: '#F3E5F5', color: '#6A1B9A',    label: 'Holiday'    },
  upcoming:   { bg: '#F1F5F9', color: '#475569',    label: 'N/A'        },
  not_joined: { bg: '#FEF3C7', color: '#B45309',    label: 'Not Joined' },
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.upcoming
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      padding:      '2px 10px',
      borderRadius: 9999,
      fontSize:     12,
      fontWeight:   700,
      background:   s.bg,
      color:        s.color,
    }}>{s.label}</span>
  )
}

const CAL: Record<string, { bg: string; pill: string; pillText: string; dayColor: string }> = {
  present:    { bg: '#bbf7d0', pill: '#16a34a', pillText: '#fff',    dayColor: '#14532d' },
  late:       { bg: '#fde68a', pill: '#d97706', pillText: '#fff',    dayColor: '#78350f' },
  absent:     { bg: '#fecaca', pill: '#dc2626', pillText: '#fff',    dayColor: '#7f1d1d' },
  leave:      { bg: '#bfdbfe', pill: '#2563eb', pillText: '#fff',    dayColor: '#1e3a8a' },
  holiday:    { bg: '#ddd6fe', pill: '#7c3aed', pillText: '#fff',    dayColor: '#4c1d95' },
  weekend:    { bg: '#e2e8f0', pill: '#64748b', pillText: '#fff',    dayColor: '#475569' },
  upcoming:   { bg: '#FFFFFF', pill: '',        pillText: '',        dayColor: '#cbd5e1' },
  not_joined: { bg: '#fef3c7', pill: '#b45309', pillText: '#fff',    dayColor: '#78350f' },
}

const CAL_LABEL: Record<string, string> = {
  present: 'Present', late: 'Late', absent: 'Absent',
  leave: 'Leave', holiday: 'Holiday', weekend: 'Off', upcoming: '', not_joined: 'Not Joined',
}

function CalendarView({ calendar, year, month, userName, userRole, summary }: {
  calendar: any[]; year: number; month: number; userName?: string; userRole?: string
  summary: { present?: number; absent?: number; late?: number; leave?: number }
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay    = new Date(year, month - 1, 1).getDay()
  const todayStr    = new Date().toISOString().split('T')[0]

  const dayMap: Record<number, any> = {}
  calendar.forEach(r => { dayMap[parseInt(r.date.split('-')[2], 10)] = r })

  return (
    <div>
      {/* Header bar, matches Attendance Report's calendar header */}
      <div style={{ background: '#64748B', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
            {userName ?? 'My Attendance'}
          </h2>
          {userRole && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: '"Aptos", sans-serif' }}>
              {userRole.replace(/_/g, ' ')}
            </span>
          )}
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 600, fontFamily: '"Aptos", sans-serif' }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12 }}>
          {[
            { label: 'Present', val: summary.present ?? 0, color: '#86efac' },
            { label: 'Absent',  val: summary.absent ?? 0,  color: '#fca5a5' },
            { label: 'Late',    val: summary.late ?? 0,    color: '#fde68a' },
            { label: 'Leave',   val: summary.leave ?? 0,   color: '#93c5fd' },
          ].map(({ label, val, color }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F1F5F9', fontFamily: '"Aptos", sans-serif', fontWeight: 700 }}>
              <span style={{ color }}>{val}</span> {label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 20px 28px' }}>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 8 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{
            textAlign: 'center', padding: '7px 0',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
            color: P.navy, fontFamily: '"Aptos", sans-serif',
            borderBottom: `2px solid ${P.gold}`,
          }}>{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const row     = dayMap[d]
          const status  = row?.status ?? 'upcoming'
          const cs      = CAL[status] ?? CAL.upcoming
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const isToday = dateStr === todayStr

          return (
            <div key={d} style={{
              minHeight: 86,
              borderRadius: 10,
              background: cs.bg,
              border: isToday ? `2px solid ${P.teal}` : '1.5px solid #E2E8F0',
              boxShadow: isToday ? `0 0 0 3px ${P.teal}18` : '0 1px 2px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '7px 8px 8px',
              position: 'relative',
            }}>

              {/* Row 1: day number left, status pill right */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: isToday ? P.teal : cs.dayColor, fontFamily: '"Aptos", sans-serif', lineHeight: 1 }}>
                  {isToday
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: P.teal, color: '#fff', fontSize: 11, fontWeight: 900 }}>{d}</span>
                    : d}
                </span>
                {cs.pill && (
                  <span style={{
                    padding: '2px 7px', borderRadius: 6,
                    background: cs.pill, color: cs.pillText,
                    fontSize: 9, fontWeight: 800,
                    fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>{CAL_LABEL[status]}</span>
                )}
              </div>

              {/* Row 2: login time, exact centre */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {row?.login_time && (
                  <span style={{ fontSize: 16, fontWeight: 900, color: cs.dayColor, fontFamily: '"Aptos", sans-serif', letterSpacing: '0.05em' }}>
                    {formatTime12h(row.login_time)}
                  </span>
                )}
              </div>

              {/* Row 3: late minutes, bottom centre */}
              <div style={{ display: 'flex', justifyContent: 'center', minHeight: 18 }}>
                {row?.is_late && (
                  <span style={{
                    padding: '1px 7px', borderRadius: 5,
                    background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                    fontSize: 9, fontWeight: 800, fontFamily: '"Aptos", sans-serif',
                  }}>{row.late_minutes}m</span>
                )}
              </div>

              {/* Edited dot */}
              {row?.manually_edited && (
                <span style={{
                  position: 'absolute', top: 7, right: 7,
                  width: 6, height: 6, borderRadius: '50%',
                  background: P.gold,
                }} title="Edited" />
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 20 }}>
        {(['present','late','absent','leave','weekend','not_joined'] as const).map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-block', padding: '2px 10px', borderRadius: 6,
              background: CAL[k].bg, color: CAL[k].dayColor,
              fontSize: 10, fontWeight: 800, fontFamily: '"Aptos", sans-serif',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              border: `1px solid ${CAL[k].pill}55`,
            }}>{CAL_LABEL[k]}</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}

const dropdownArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`

const pillSelect: React.CSSProperties = {
  flexShrink: 0, padding: '4px 28px 4px 10px', borderRadius: 30, border: 'none',
  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif',
  background: 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none',
  appearance: 'none', backgroundImage: dropdownArrow,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
}

export default function MyAttendancePage() {
  const { user } = useAuth()
  const now      = new Date()
  const nowYear  = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  const [month,    setMonth]    = useState(nowMonth)
  const [year,     setYear]     = useState(nowYear)
  const [view,     setView]     = useState<'list' | 'calendar'>('list')
  const [calendar, setCalendar] = useState<any[]>([])
  const [summary,  setSummary]  = useState<any>({})
  const [loading,  setLoading]  = useState(true)

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

  useEffect(() => { fetchData() }, [month, year]) // eslint-disable-line
  useAutoRefresh(() => fetchData(true))

  async function fetchData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/attendance/my', { params: { month, year } })
      setCalendar(data.data?.calendar ?? [])
      setSummary(data.data?.summary ?? {})
    } catch { /* ignore */ } finally { if (!silent) setLoading(false) }
  }

  const totalDays = new Date(year, month, 0).getDate()

  const STAT_CARDS = [
    { label: 'Total Days',   val: totalDays,             border: P.navy,    fill: '#C7D2FE' },
    { label: 'Working Days', val: summary.working_days,  border: '#0891B2', fill: '#A5D8DD' },
    { label: 'Present',      val: summary.present,       border: '#16A34A', fill: '#BBF0D6' },
    { label: 'Absent',       val: summary.absent,        border: '#DC2626', fill: '#FECACA' },
    { label: 'Late',         val: summary.late ?? 0,     border: '#64748B', fill: '#D4DAE3' },
    { label: 'Leave',        val: summary.leave,         border: '#1565C0', fill: '#BDDAF8' },
    { label: 'Weekends',     val: summary.weekend,       border: '#64748B', fill: '#E2E8F0' },
    { label: 'Not Joined',   val: summary.not_joined ?? 0, border: '#B45309', fill: '#FEF3C7' },
  ]

  const tdBase: React.CSSProperties = {
    padding: '6px 14px', borderBottom: '1px solid #F1F5F9',
    fontSize: 13, fontFamily: '"Aptos", sans-serif', color: P.navy,
  }

  return (
    <div style={{ padding: '0 20px 20px', minHeight: '100vh', background: P.bgMain }}>

      {/* Header */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496', margin: 0 }}>
          My Attendance
        </h1>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
        {STAT_CARDS.map(({ label, val, border, fill }) => (
          <div key={label} style={{ flex: 1, minWidth: 80, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827', fontFamily: '"Aptos", sans-serif' }}>{val ?? 0}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px' }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={pillSelect}>
            {availableMonths.map(m => <option key={m} value={m} style={{ background: P.navy }}>{MONTH_NAMES[m - 1]}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={pillSelect}>
            {availableYears.map(y => <option key={y} value={y} style={{ background: P.navy }}>{y}</option>)}
          </select>
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />
          {/* List / Calendar toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.15)', borderRadius: 30, padding: 3 }}>
            {(['list', 'calendar'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '3px 14px', borderRadius: 30, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: '"Aptos", sans-serif',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? P.teal : '#fff',
                transition: 'all .15s',
              }}>
                {v === 'list' ? 'List' : 'Calendar'}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', fontFamily: '"Aptos", sans-serif' }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
        </div>
      </div>

      {/* Table / Calendar */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>

        {/* List view */}
        {view === 'list' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F2AC18' }}>
                  {['#', 'Date', 'Day', 'Login Time', 'Status', 'Approval'].map(h => (
                    <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: '"Aptos", sans-serif', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {[1,2,3,4,5,6].map(c => (
                        <td key={c} style={{ ...tdBase }}>
                          <div style={{ height: 12, borderRadius: 4, background: '#F1F5F9' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                  : calendar.length === 0
                    ? <tr><td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No records found.</td></tr>
                    : calendar.map((row, idx) => {
                      const isWeekend   = row.status === 'weekend'
                      const isUpcoming  = row.status === 'upcoming'
                      const isNotJoined = row.status === 'not_joined'
                      return (
                        <tr key={row.date} style={{ background: '#fff', opacity: (isWeekend || isNotJoined) ? 0.65 : 1, transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                          <td style={{ ...tdBase, fontWeight: 700, color: '#94A3B8', width: 40 }}>{idx + 1}</td>
                          <td style={{ ...tdBase, fontWeight: 700 }}>{row.date}</td>
                          <td style={{ ...tdBase, color: '#64748B' }}>{row.day_name}</td>
                          <td style={tdBase}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {row.login_time
                                ? <span style={{ fontWeight: 700, color: P.teal }}>{formatTime12h(row.login_time)}</span>
                                : <span style={{ color: '#94A3B8' }}>N/A</span>}
                              {row.manually_edited && (
                                <span style={{ fontSize: 9, fontWeight: 700, background: P.gold + '22', color: P.gold, border: `1px solid ${P.gold}55`, padding: '0 4px', borderRadius: 3 }}>EDITED</span>
                              )}
                            </div>
                          </td>
                          <td style={tdBase}>
                            {isUpcoming ? <span style={{ color: '#94A3B8' }}>N/A</span> : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <StatusPill status={row.status} />
                                {row.is_late && (
                                  <span style={{ fontSize: 10, fontWeight: 700, background: '#D4DAE3', color: '#374151', padding: '1px 6px', borderRadius: 4 }}>+{row.late_minutes}m</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={tdBase}>
                            {isUpcoming || isWeekend || isNotJoined
                              ? <span style={{ color: '#94A3B8' }}>N/A</span>
                              : <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: row.approval_status === 'approved' ? '#BBF0D6' : '#FECACA', color: row.approval_status === 'approved' ? '#15803D' : '#B91C1C' }}>
                                  {row.approval_status === 'approved' ? 'Approved' : 'Pending'}
                                </span>
                            }
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Calendar view */}
        {view === 'calendar' && (
          loading
            ? <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 160 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: `4px solid ${P.teal}30`, borderTopColor: P.teal, animation: 'spin 0.75s linear infinite' }} />
              </div>
            : <CalendarView calendar={calendar} year={year} month={month} userName={user?.fullName} userRole={user?.role} summary={summary} />
        )}
      </div>
    </div>
  )
}

