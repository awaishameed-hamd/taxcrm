'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'

const NAVY = P.navy
const TEAL = P.teal

// ── Helpers ────────────────────────────────────────────────────────────────────
function to12hr(val: string) {
  if (!val) return ''
  const [h, m] = val.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`
}

function to24hr(val: string) {
  const match = val.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let h = parseInt(match[1])
  const m = parseInt(match[2])
  const ampm = match[3].toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Inline toast ───────────────────────────────────────────────────────────────
function Toast({ msg, ok, onDone }: { msg: string; ok: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold"
      style={{ background: ok ? '#15803d' : '#dc2626', color: '#fff', fontFamily: '"Aptos", sans-serif' }}>
      <span>{ok ? '✓' : '✕'}</span>
      {msg}
    </div>
  )
}

// ── Time Picker card ──────────────────────────────────────────────────────────
function TimeCard({
  icon, title, subtitle, settingKey, initVal, onSave,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  settingKey: string
  initVal: string
  onSave: (key: string, val: string) => Promise<void>
}) {
  const [display, setDisplay] = useState(to12hr(initVal) || '09:00 AM')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (initVal) setDisplay(to12hr(initVal))
  }, [initVal])

  function getH()  { return display.match(/^(\d{2})/)?.[1] || '09' }
  function getM()  { return display.match(/^(\d{2}):(\d{2})/)?.[2] || '00' }
  function getAP() { return display.match(/(AM|PM)$/i)?.[1]?.toUpperCase() || 'AM' }

  function updateDisplay(h: string, m: string, ap: string) {
    setDisplay(`${h}:${m} ${ap}`)
  }

  async function handleSave() {
    const val = to24hr(display)
    if (!val) return
    setSaving(true)
    try { await onSave(settingKey, val) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${NAVY}, ${TEAL})` }}>
          {icon}
        </div>
        <div>
          <h2 className="font-bold text-sm" style={{ fontFamily: '"Aptos", sans-serif', color: NAVY, letterSpacing: '0.04em' }}>
            {title}
          </h2>
          <p className="text-xs" style={{ color: '#64748B' }}>{subtitle}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-6 space-y-5">
        {/* Current value */}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: '#F0F9FA', border: '1px solid #C8E8ED' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="text-sm" style={{ color: NAVY }}>
            Current: <strong style={{ fontFamily: '"Aptos", sans-serif', fontSize: '1rem' }}>{to12hr(initVal) || ''}</strong>
          </span>
        </div>

        {/* Picker */}
        <div>
          <label className="block text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: '#64748B' }}>
            New Time
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Hour */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>Hour</span>
              <select value={getH()} onChange={e => updateDisplay(e.target.value, getM(), getAP())}
                className="rounded-lg px-3 py-2.5 text-center font-bold outline-none cursor-pointer"
                style={{ border: '1.5px solid #CBD5E1', color: NAVY, fontFamily: '"Aptos", sans-serif', fontSize: '1.1rem', width: 70, appearance: 'none', textAlign: 'center' }}
                onFocus={e => (e.target.style.borderColor = TEAL)}
                onBlur={e  => (e.target.style.borderColor = '#CBD5E1')}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <span className="font-black text-2xl pb-0.5" style={{ color: NAVY }}>:</span>

            {/* Minute */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>Minute</span>
              <select value={getM()} onChange={e => updateDisplay(getH(), e.target.value, getAP())}
                className="rounded-lg px-3 py-2.5 text-center font-bold outline-none cursor-pointer"
                style={{ border: '1.5px solid #CBD5E1', color: NAVY, fontFamily: '"Aptos", sans-serif', fontSize: '1.1rem', width: 70, appearance: 'none', textAlign: 'center' }}
                onFocus={e => (e.target.style.borderColor = TEAL)}
                onBlur={e  => (e.target.style.borderColor = '#CBD5E1')}>
                {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* AM/PM */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>AM/PM</span>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1.5px solid #CBD5E1' }}>
                {['AM', 'PM'].map(ap => {
                  const active = getAP() === ap
                  return (
                    <button key={ap} type="button"
                      onClick={() => updateDisplay(getH(), getM(), ap)}
                      className="px-4 py-2.5 text-sm font-bold transition-all"
                      style={{
                        background: active ? `linear-gradient(135deg, ${NAVY}, ${TEAL})` : '#fff',
                        color: active ? '#fff' : '#94A3B8',
                        fontFamily: '"Aptos", sans-serif', letterSpacing: '0.05em',
                        border: 'none', cursor: 'pointer', minWidth: 52,
                      }}>
                      {ap}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Save */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold opacity-0">Save</span>
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff',
                  fontFamily: '"Aptos", sans-serif', letterSpacing: '0.05em',
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Grace period (minutes) card ────────────────────────────────────────────────
function GraceCard({
  initVal, onSave, settingKey = 'grace_period_minutes',
}: {
  initVal: string
  onSave: (key: string, val: string) => Promise<void>
  settingKey?: string
}) {
  const [minutes, setMinutes] = useState(initVal || '15')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { if (initVal) setMinutes(initVal) }, [initVal])

  const dec = () => setMinutes(v => String(Math.max(1,   parseInt(v || '15', 10) - 1)))
  const inc = () => setMinutes(v => String(Math.min(120, parseInt(v || '15', 10) + 1)))

  async function handleSave() {
    const val = parseInt(minutes, 10)
    if (isNaN(val) || val < 1 || val > 120) return
    setSaving(true)
    try { await onSave(settingKey, String(val)) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl overflow-hidden mt-4" style={{ background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${NAVY}, ${TEAL})` }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <h2 className="font-bold text-sm" style={{ fontFamily: '"Aptos", sans-serif', color: NAVY, letterSpacing: '0.04em' }}>
            GRACE PERIOD (LATE MARGIN)
          </h2>
          <p className="text-xs" style={{ color: '#64748B' }}>
            Minutes after reporting time before marking attendance as late
          </p>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>Minutes</span>
            <div className="flex items-center gap-1 rounded-lg overflow-hidden" style={{ border: '1.5px solid #CBD5E1' }}>
              <button type="button" onClick={dec}
                className="px-3 py-2.5 font-bold text-lg transition-colors"
                style={{ background: '#F8FAFC', color: NAVY, border: 'none', cursor: 'pointer', lineHeight: 1 }}>−</button>
              <input type="number" min={1} max={120} value={minutes}
                onChange={e => setMinutes(e.target.value)}
                className="text-center font-bold outline-none"
                style={{ width: 52, border: 'none', color: NAVY, fontFamily: '"Aptos", sans-serif', fontSize: '1.1rem', padding: '10px 0' }} />
              <button type="button" onClick={inc}
                className="px-3 py-2.5 font-bold text-lg transition-colors"
                style={{ background: '#F8FAFC', color: NAVY, border: 'none', cursor: 'pointer', lineHeight: 1 }}>+</button>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold opacity-0">Save</span>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{
                background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff',
                fontFamily: '"Aptos", sans-serif', letterSpacing: '0.05em',
                border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AttendanceSettings() {
  const [settings,    setSettings]    = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [weekendDay,  setWeekendDay]  = useState<'saturday' | 'sunday'>('saturday')

  useEffect(() => {
    api.get('/attendance/settings')
      .then(({ data }) => setSettings(data.data ?? data))
      .catch(() => setToast({ msg: 'Failed to load attendance settings.', ok: false }))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(key: string, value: string) {
    try {
      await api.patch(`/attendance/settings/${key}`, { value })
      setSettings(prev => ({ ...prev, [key]: value }))
      setToast({ msg: 'Setting saved successfully.', ok: true })
    } catch {
      setToast({ msg: 'Failed to save. Please try again.', ok: false })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
      </div>
    )
  }

  const dayPrefix = weekendDay

  const clockIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
  const calIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )

  const SectionLabel = ({ children }: { children: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      <span style={{ fontFamily: '"Aptos", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#94A3B8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
    </div>
  )

  const enableKey = `${dayPrefix}_attendance_enabled`
  const isEnabled = settings[enableKey] === 'true'
  const dayLabel  = weekendDay === 'saturday' ? 'Saturday' : 'Sunday'

  return (
    <div style={{ width: '100%' }}>
      {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 28px', alignItems: 'start' }}>

        {/* ── LEFT: Weekday Settings ── */}
        <div>
          <SectionLabel>Weekday Settings</SectionLabel>

          <TimeCard
            settingKey="reporting_time"
            initVal={settings.reporting_time ?? '09:00'}
            title="ATTENDANCE TIME"
            subtitle="Attendance is only marked on logins at or after this time (window start)"
            icon={clockIcon}
            onSave={handleSave}
          />
          <div className="mt-4">
            <TimeCard
              settingKey="login_time"
              initVal={settings.login_time ?? '10:00'}
              title="LOGIN TIME"
              subtitle="Official office hours start, late minutes are calculated from this time"
              icon={calIcon}
              onSave={handleSave}
            />
          </div>
          <GraceCard initVal={settings.grace_period_minutes ?? '15'} onSave={handleSave} />
        </div>

        {/* ── Vertical divider ── */}
        <div style={{ background: '#E2E8F0', alignSelf: 'stretch', marginTop: 28 }} />

        {/* ── RIGHT: Weekend Settings ── */}
        <div>
          <SectionLabel>Weekend Settings</SectionLabel>

          {/* Day selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['saturday', 'sunday'] as const).map(day => {
              const active = weekendDay === day
              return (
                <button key={day} onClick={() => setWeekendDay(day)}
                  style={{
                    padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: '"Aptos", sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                    textTransform: 'capitalize',
                    background: active ? `linear-gradient(135deg, ${NAVY}, ${TEAL})` : '#fff',
                    color: active ? '#fff' : '#64748B',
                    boxShadow: active ? '0 2px 8px rgba(30,132,150,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
                    transition: 'all 0.15s',
                  }}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </button>
              )
            })}
          </div>

          {/* Enable/disable toggle card */}
          <div className="rounded-2xl overflow-hidden mb-4" style={{ background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: '"Aptos", sans-serif', fontWeight: 700, fontSize: 13, color: NAVY, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {dayLabel} Attendance
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {isEnabled
                    ? `Tracked on ${dayLabel}s, login time and late marking active`
                    : `${dayLabel} is a day off, no attendance marked`}
                </div>
              </div>
              <button
                onClick={async () => { await handleSave(enableKey, isEnabled ? 'false' : 'true') }}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: isEnabled ? TEAL : '#CBD5E1',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
                }}>
                <span style={{
                  position: 'absolute', top: 3, left: isEnabled ? 25 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>
          </div>

          {/* Time settings — only when enabled */}
          {isEnabled && (
            <>
              <TimeCard
                key={`${dayPrefix}_reporting_time`}
                settingKey={`${dayPrefix}_reporting_time`}
                initVal={settings[`${dayPrefix}_reporting_time`] ?? settings.reporting_time ?? '09:00'}
                title="ATTENDANCE TIME"
                subtitle={`Window start for ${dayLabel}s`}
                icon={clockIcon}
                onSave={handleSave}
              />
              <div className="mt-4">
                <TimeCard
                  key={`${dayPrefix}_login_time`}
                  settingKey={`${dayPrefix}_login_time`}
                  initVal={settings[`${dayPrefix}_login_time`] ?? settings.login_time ?? '10:00'}
                  title="LOGIN TIME"
                  subtitle={`Official start for ${dayLabel}s, late calculated from here`}
                  icon={calIcon}
                  onSave={handleSave}
                />
              </div>
              <GraceCard
                key={`${dayPrefix}_grace`}
                settingKey={`${dayPrefix}_grace_period_minutes`}
                initVal={settings[`${dayPrefix}_grace_period_minutes`] ?? settings.grace_period_minutes ?? '15'}
                onSave={handleSave}
              />
            </>
          )}
        </div>

      </div>{/* end grid */}
    </div>
  )
}
