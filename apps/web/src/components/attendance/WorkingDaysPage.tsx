'use client'

import { useState, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MODULE_START_YEAR = 2026
const MODULE_START_MONTH = 1

const STATUS_OPTIONS = [
  { value: 'WORKING_DAY', label: 'Working Day' },
  { value: 'WEEKEND',     label: 'Weekend'     },
  { value: 'HOLIDAY',     label: 'Holiday'     },
]

function pktToday(offset = 0): string {
  const now = new Date()
  const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000)
  if (offset) pkt.setUTCDate(pkt.getUTCDate() + offset)
  return pkt.toISOString().split('T')[0]
}

function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: type === 'success' ? '#E6F4F6' : '#FFEBEE',
      border: `1px solid ${type === 'success' ? P.teal : '#f87171'}`,
      borderRadius: 10, padding: '12px 18px', fontSize: 13,
      color: type === 'success' ? P.deepTeal : '#C62828',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {msg}
      <button onClick={onClose} style={{ background: 0, border: 0, cursor: 'pointer', color: 'inherit', marginLeft: 8, fontWeight: 700 }}>×</button>
    </div>
  )
}

export default function WorkingDaysPage() {
  const now      = new Date()
  const nowYear  = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  const maxYear  = nowMonth === 12 ? nowYear + 1 : nowYear
  const maxMonth = nowMonth === 12 ? 1 : nowMonth + 1

  const [month,    setMonth]    = useState(nowMonth)
  const [year,     setYear]     = useState(nowYear)
  const [days,      setDays]      = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState<{ msg: string; type: string } | null>(null)
  const [loginTime, setLoginTime] = useState('10:00')
  const [satEnabled,   setSatEnabled]   = useState(false)
  const [sunEnabled,   setSunEnabled]   = useState(false)
  const [satLoginTime, setSatLoginTime] = useState('10:00')
  const [sunLoginTime, setSunLoginTime] = useState('10:00')

  const availableYears = useMemo(() => {
    const arr = []
    for (let y = MODULE_START_YEAR; y <= maxYear; y++) arr.push(y)
    return arr
  }, [maxYear])

  const availableMonths = useMemo(() => {
    const minM = year === MODULE_START_YEAR ? MODULE_START_MONTH : 1
    const mxM  = year === maxYear ? maxMonth : 12
    const arr = []
    for (let m = minM; m <= mxM; m++) arr.push(m)
    return arr
  }, [year, maxYear, maxMonth])

  useEffect(() => {
    const minM = year === MODULE_START_YEAR ? MODULE_START_MONTH : 1
    const mxM  = year === maxYear ? maxMonth : 12
    if (month < minM) setMonth(minM)
    else if (month > mxM) setMonth(mxM)
  }, [year]) // eslint-disable-line

  useEffect(() => { fetchData() }, [month, year]) // eslint-disable-line

  async function fetchData() {
    setLoading(true)
    try {
      const [wdRes, settingsRes] = await Promise.all([
        api.get('/working-days', { params: { month, year } }),
        api.get('/attendance/settings'),
      ])
      const s = settingsRes.data.data ?? settingsRes.data
      const globalLoginTime = s?.login_time ?? '10:00'
      if (s?.login_time) setLoginTime(s.login_time)
      setSatEnabled(s?.saturday_attendance_enabled === 'true')
      setSunEnabled(s?.sunday_attendance_enabled   === 'true')
      setSatLoginTime(s?.saturday_login_time ?? globalLoginTime)
      setSunLoginTime(s?.sunday_login_time   ?? globalLoginTime)

      const today    = pktToday()
      const rawDays  = wdRes.data.data?.days ?? []
      // Future days auto-reflect the current global login_time setting
      const mergedDays = rawDays.map((d: any) =>
        d.date > today ? { ...d, login_time_formatted: globalLoginTime } : d
      )
      setDays(mergedDays)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  function setDayField(idx: number, field: string, value: any) {
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  async function handleSave() {
    const missing = days.find(d => d.dayType === 'HOLIDAY' && !d.leave_reason?.trim())
    if (missing) {
      setToast({ msg: `Holiday reason is required for ${missing.date}.`, type: 'error' })
      return
    }
    setSaving(true)
    try {
      await api.post('/working-days/setup', {
        month, year,
        days: days.map(d => ({
          date:                 d.date,
          dayType:              d.dayType ?? d.status?.toUpperCase().replace('_', '_'),
          leaveReason:          d.leave_reason ?? null,
          reportingTimeOverride: d.login_time_formatted ?? null,
        })),
      })
      setToast({ msg: `Working days for ${MONTH_NAMES[month - 1]} ${year} saved.`, type: 'success' })
    } catch (err: any) {
      setToast({ msg: err.response?.data?.message ?? 'Save failed.', type: 'error' })
    } finally { setSaving(false) }
  }

  const summary = useMemo(() => ({
    working:  days.filter(d => d.dayType === 'WORKING_DAY' || d.status === 'working_day').length,
    weekends: days.filter(d => d.dayType === 'WEEKEND'     || d.status === 'weekend').length,
    holidays: days.filter(d => d.dayType === 'HOLIDAY'     || d.status === 'leave').length,
    total:    days.length,
  }), [days])

  return (
    <div style={{ padding: '0 20px 20px', height: '100vh', background: P.bgMain, display: 'flex', flexDirection: 'column' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: P.navy, margin: 0 }}>
            Working Days
          </h1>
        </div>
        <button onClick={handleSave} disabled={saving || loading}
          style={{
            padding: '9px 20px', border: 0, borderRadius: 8, cursor: 'pointer',
            background: `linear-gradient(135deg, ${P.teal} 0%, ${P.deepTeal} 100%)`,
            color: '#fff', fontFamily: '"Aptos", sans-serif', fontSize: 13,
            fontWeight: 700, letterSpacing: '0.04em', opacity: saving || loading ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
        {[
          { label: 'Working',  val: summary.working,  border: '#16A34A', fill: '#BBF0D6', textColor: '#111827' },
          { label: 'Weekends', val: summary.weekends, border: '#64748B', fill: '#D4DAE3', textColor: '#111827' },
          { label: 'Holidays', val: summary.holidays, border: '#1565C0', fill: '#BDDAF8', textColor: '#111827' },
          { label: 'Total',    val: summary.total,    border: P.teal,    fill: '#C8E9EE', textColor: '#111827' },
        ].map(({ label, val, border, fill, textColor }) => (
          <div key={label} style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: textColor, fontFamily: '"Aptos", sans-serif' }}>{val ?? 0}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px' }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', background: 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', appearance: 'none', paddingRight: 24, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
            {availableMonths.map(m => <option key={m} value={m} style={{ background: P.navy }}>{MONTH_NAMES[m - 1]}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', background: 'rgba(255,255,255,0.18)', color: '#fff', outline: 'none', appearance: 'none', paddingRight: 24, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
            {availableYears.map(y => <option key={y} value={y} style={{ background: P.navy }}>{y}</option>)}
          </select>
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', fontFamily: '"Aptos", sans-serif' }}>{MONTH_NAMES[month - 1]} {year}</span>
        </div>
      </div>

      {/* Table card */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>


        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#F2AC18' }}>
                {['Date', 'Day', 'Type', 'Reason / Note', 'Login Time'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', color: P.navy,
                    fontFamily: '"Aptos", sans-serif', letterSpacing: '0.07em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                    {[1,2,3,4,5].map(c => (
                      <td key={c} style={{ padding: '10px 16px', borderBottom: `1px solid ${P.gridLine}` }}>
                        <div style={{ height: 12, borderRadius: 4, background: P.gridLine }} />
                      </td>
                    ))}
                  </tr>
                ))
                : days.length === 0
                  ? <tr><td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted }}>No data.</td></tr>
                  : days.map((row, idx) => {
                    const isLocked = row.date < pktToday(-1)
                    const dayType  = row.dayType ?? (row.status === 'working_day' ? 'WORKING_DAY' : row.status === 'weekend' ? 'WEEKEND' : 'HOLIDAY')

                    const rowBg = dayType === 'HOLIDAY' ? 'rgba(73,49,30,0.06)' : dayType === 'WEEKEND' ? '#F8FAFC' : idx % 2 === 0 ? '#fff' : '#F9FAFB'

                    return (
                      <tr key={row.date} style={{ background: rowBg, opacity: isLocked ? 0.65 : 1 }}>
                        <td style={{ padding: '9px 16px', borderBottom: `1px solid ${P.gridLine}`, fontWeight: 600, color: P.textHeading }}>
                          {row.date}
                        </td>
                        <td style={{ padding: '9px 16px', borderBottom: `1px solid ${P.gridLine}`, color: P.textMuted, fontFamily: '"Aptos", sans-serif', letterSpacing: '0.02em' }}>
                          {DAY_NAMES[new Date(row.date).getDay()]}
                        </td>
                        <td style={{ padding: '9px 16px', borderBottom: `1px solid ${P.gridLine}` }}>
                          {isLocked
                            ? <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: dayType === 'HOLIDAY' ? '#FFF3E0' : dayType === 'WEEKEND' ? '#F5F5F5' : '#E6F4F6',
                                color: dayType === 'HOLIDAY' ? P.brick : dayType === 'WEEKEND' ? P.textMuted : P.deepTeal,
                              }}>
                                {STATUS_OPTIONS.find(o => o.value === dayType)?.label ?? dayType}
                              </span>
                            : <select
                                value={dayType}
                                onChange={e => setDayField(idx, 'dayType', e.target.value)}
                                style={{
                                  borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 600,
                                  border: `1px solid ${P.border}`, outline: 'none', cursor: 'pointer',
                                  background: dayType === 'HOLIDAY' ? '#FFF3E0' : dayType === 'WEEKEND' ? '#F5F5F5' : '#fff',
                                  color: dayType === 'HOLIDAY' ? P.brick : dayType === 'WEEKEND' ? P.textMuted : P.textHeading,
                                }}>
                                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                          }
                        </td>
                        <td style={{ padding: '9px 16px', borderBottom: `1px solid ${P.gridLine}`, minWidth: 180 }}>
                          {dayType === 'HOLIDAY'
                            ? isLocked
                              ? <span style={{ fontSize: 12, color: '#49311E' }}>{row.leave_reason ?? 'N/A'}</span>
                              : <input
                                  type="text"
                                  placeholder="Holiday reason (required)"
                                  value={row.leave_reason ?? ''}
                                  onChange={e => setDayField(idx, 'leave_reason', e.target.value)}
                                  style={{
                                    width: '100%', border: `1px solid ${!row.leave_reason?.trim() ? '#f87171' : '#AA7F56'}`,
                                    borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none',
                                    background: 'rgba(73,49,30,0.04)', color: P.textHeading,
                                  }}
                                />
                            : <span style={{ color: P.textMuted, fontSize: 12 }}>N/A</span>
                          }
                        </td>
                        <td style={{ padding: '9px 16px', borderBottom: `1px solid ${P.gridLine}` }}>
                          {(() => {
                            const dow = new Date(row.date).getDay()
                            const isEnabledWeekend = dayType === 'WEEKEND' && (
                              (dow === 6 && satEnabled) || (dow === 0 && sunEnabled)
                            )
                            const weekendDefault = dow === 6 ? satLoginTime : sunLoginTime

                            if (dayType === 'WORKING_DAY' || isEnabledWeekend) {
                              const val = row.login_time_formatted ?? (isEnabledWeekend ? weekendDefault : loginTime)
                              return isLocked
                                ? <span style={{ fontFamily: '"Aptos", sans-serif', fontWeight: 700, color: P.textHeading, letterSpacing: '0.04em' }}>
                                    {val}
                                  </span>
                                : <input
                                    type="time"
                                    value={val}
                                    onChange={e => setDayField(idx, 'login_time_formatted', e.target.value)}
                                    style={{ border: `1px solid ${P.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none' }}
                                  />
                            }
                            return <span style={{ color: P.textMuted, fontSize: 12, fontWeight: 600 }}>N/A</span>
                          })()}
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

