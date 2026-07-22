'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Role } from '@ca-firm/shared'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'

function getRoleHome(role: Role): string {
  switch (role) {
    case Role.ADMIN:   return '/admin/dashboard'
    case Role.PARTNER: return '/partner/dashboard'
    case Role.MANAGER:   return '/manager/dashboard'
    case Role.TEAM_LEAD: return '/team-lead/dashboard'
    case Role.TRAINEE:   return '/trainee/dashboard'
    case Role.CLIENT:  return '/client/dashboard'
    default:           return '/login'
  }
}

interface AttendanceInfo {
  date:        string
  loginTime:   string
  isLate:      boolean
  lateMinutes: number | null
  status:      string
}

const fieldStyle: React.CSSProperties = {
  position:     'relative',
  display:      'flex',
  alignItems:   'center',
  background:   '#e6ebee',
  border:       '1px solid transparent',
  borderRadius: 12,
  padding:      '0 14px',
  transition:   'all .25s ease',
}

const inputStyle: React.CSSProperties = {
  flex:          1,
  border:        0,
  background:    'transparent',
  outline:       'none',
  padding:       '16px 12px',
  fontFamily:    "'Aptos', sans-serif",
  fontSize:      15,
  color:         '#4a5a63',
  fontWeight:    500,
  letterSpacing: '.01em',
}

const iconStyle: React.CSSProperties = { width: 18, height: 18, color: '#8a9aa2', flexShrink: 0 }

export default function LoginPage() {
  const { login } = useAuth()
  const router    = useRouter()

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  const [attPopup,       setAttPopup]       = useState<AttendanceInfo | null>(null)
  const [pendingNav,     setPendingNav]     = useState<string>('')
  const [weekendPrompt,  setWeekendPrompt]  = useState(false)
  const [weekendLoading, setWeekendLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(identifier, password)
      const raw    = sessionStorage.getItem('user')
      const user   = raw ? JSON.parse(raw) : null
      const dest   = getRoleHome(user?.role)

      if (result?.attendance) {
        setAttPopup(result.attendance)
        setPendingNav(dest)
      } else if (result?.weekendPrompt) {
        setWeekendPrompt(true)
        setPendingNav(dest)
      } else {
        router.replace(dest)
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid email/ID or password')
    } finally {
      setLoading(false)
    }
  }

  const handleWeekendYes = async () => {
    setWeekendLoading(true)
    try {
      const { data } = await api.post('/attendance/self-checkin')
      const attData = data?.data ?? null
      setWeekendPrompt(false)
      if (attData) {
        setAttPopup(attData)
      } else {
        router.replace(pendingNav)
      }
    } catch {
      router.replace(pendingNav)
    } finally {
      setWeekendLoading(false)
    }
  }

  // ── Weekend prompt ────────────────────────────────────────────────────────
  if (weekendPrompt) {
    const dayName = new Date().getDay() === 6 ? 'Saturday' : 'Sunday'
    return (
      <div
        className="login-bg"
        style={{
          fontFamily: "'Aptos', sans-serif",
          background: 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)',
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '32px 16px', position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />

        <div style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 420,
          background: 'linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.75))',
          backdropFilter: 'blur(20px) saturate(1.1)',
          border: '1px solid rgba(255,255,255,.7)',
          borderRadius: 22,
          padding: '44px 38px',
          boxShadow: '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)',
          textAlign: 'center',
        }}>
          {/* Weekend icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px -4px rgba(74,90,99,0.45)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>

          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.45rem', fontWeight: 700, color: '#4a5a63', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
            It&apos;s a {dayName}!
          </h2>
          <p style={{ color: '#8a9aa2', fontSize: '0.88rem', margin: '0 0 32px', lineHeight: 1.6 }}>
            Did you come to the office today?<br />
            Select an option to continue.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={handleWeekendYes}
              disabled={weekendLoading}
              className="lbtn"
              style={{
                width: '100%', padding: '14px 0', border: 0, borderRadius: 12,
                background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)',
                color: '#fff', fontFamily: "'Outfit', sans-serif",
                fontSize: 15, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase',
                cursor: weekendLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)',
                opacity: weekendLoading ? 0.7 : 1,
              }}>
              {weekendLoading ? (
                <>
                  <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" className="animate-spin">
                    <circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                  </svg>
                  Marking...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Yes, Mark My Attendance
                </>
              )}
            </button>

            <button
              onClick={() => router.replace(pendingNav)}
              disabled={weekendLoading}
              style={{
                width: '100%', padding: '13px 0', border: '1.5px solid rgba(93,111,120,0.3)', borderRadius: 12,
                background: 'transparent',
                color: '#5d6f78', fontFamily: "'Outfit', sans-serif",
                fontSize: 15, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase',
                cursor: weekendLoading ? 'not-allowed' : 'pointer',
                opacity: weekendLoading ? 0.5 : 1,
              }}>
              No, Just Checking
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Attendance popup ──────────────────────────────────────────────────────
  if (attPopup) {
    return (
      <div
        className="login-bg"
        style={{
          fontFamily: "'Aptos', sans-serif",
          background: 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)',
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '32px 16px', position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Decorative blobs, same as login */}
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />

        <div style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 400,
          background: 'linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.75))',
          backdropFilter: 'blur(20px) saturate(1.1)',
          border: '1px solid rgba(255,255,255,.7)',
          borderRadius: 22,
          padding: '44px 38px',
          boxShadow: '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)',
          textAlign: 'center',
        }}>
          {/* Check icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px -4px rgba(74,90,99,0.45)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.45rem', fontWeight: 700, color: '#4a5a63', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            {attPopup.isLate ? 'Late Attendance Marked' : 'Attendance Marked'}
          </h2>
          <p style={{ color: '#8a9aa2', fontSize: '0.85rem', margin: '0 0 24px', letterSpacing: '.01em' }}>
            Your attendance has been recorded for today
          </p>

          {/* Time */}
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '3rem', fontWeight: 700, color: '#4a5a63', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 6 }}>
            {attPopup.loginTime}
          </div>
          <div style={{ color: '#8a9aa2', fontSize: '0.9rem', letterSpacing: '.04em', marginBottom: attPopup.isLate ? 14 : 32 }}>
            {attPopup.date}
          </div>

          {/* Late badge */}
          {attPopup.isLate && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(93,111,120,0.1)', border: '1px solid rgba(93,111,120,0.35)',
              borderRadius: 20, padding: '5px 16px', marginBottom: 28,
              color: '#5d6f78', fontSize: '0.78rem', fontFamily: "'Outfit', sans-serif",
              fontWeight: 700, letterSpacing: '0.08em',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              LATE +{attPopup.lateMinutes} min
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '0 0 24px' }} />

          <button
            onClick={() => router.replace(pendingNav)}
            className="lbtn"
            style={{
              width: '100%', padding: '14px 0', border: 0, borderRadius: 12,
              background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)',
              color: '#fff', fontFamily: "'Outfit', sans-serif",
              fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase',
              cursor: 'pointer', display: 'block',
              boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)',
            }}>
            OK, Got It
          </button>
        </div>
      </div>
    )
  }

  // ── Login form ─────────────────────────────────────────────────────────────
  return (
    <div
      className="login-bg"
      style={{
        fontFamily: "'Aptos', sans-serif",
        background: 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)',
        minHeight:  '100vh',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:    '32px 16px',
        color:      '#5d6f78',
        position:   'relative',
        overflow:   'hidden',
      }}
    >
      {/* Decorative blobs */}
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />

      {/* Card */}
      <main style={{
        position:       'relative',
        zIndex:         2,
        width:          '100%',
        maxWidth:       432,
        background:     'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.7))',
        backdropFilter: 'blur(20px) saturate(1.1)',
        border:         '1px solid rgba(255,255,255,.7)',
        borderRadius:   22,
        padding:        '44px 38px 44px',
        boxShadow:      '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)',
      }}>

        {/* Header, logo + heading, no colored band */}
        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <Image src="/logo.png" alt="Asif Associates" width={1536} height={1024} priority
              style={{ width: 190, height: 'auto', filter: 'drop-shadow(0 12px 22px rgba(74,90,99,.3))' }} />
          </div>

          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 38, fontWeight: 700, letterSpacing: '-.02em', color: '#4a5a63', lineHeight: 1.05, margin: 0 }}>
            User Login
          </h1>
        </header>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 14, background: 'rgba(214,40,40,0.08)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>

          {/* Email */}
          <div className="lfield" style={fieldStyle}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <input name="identifier" type="text" autoComplete="username" required
              value={identifier} onChange={e => setIdentifier(e.target.value)}
              placeholder="Email or User ID" style={inputStyle} />
          </div>

          {/* Password */}
          <div className="lfield" style={fieldStyle}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input name="password" type={showPw ? 'text' : 'password'}
              autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" style={inputStyle} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ background: 'transparent', border: 0, color: '#8a9aa2', cursor: 'pointer', padding: 6, marginRight: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, transition: 'color .2s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#4a5a63' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8a9aa2' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                }
              </svg>
            </button>
          </div>

          {/* Remember me + Forgot */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: '0 4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: '#5d6f78' }}
              onClick={() => setRememberMe(v => !v)}>
              <span style={{
                width: 18, height: 18, borderRadius: 5,
                border: rememberMe ? 'none' : '1.5px solid #8a9aa2',
                background: rememberMe ? '#5d6f78' : '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .2s', flexShrink: 0,
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: 12, height: 12, opacity: rememberMe ? 1 : 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              Remember me
            </label>
            <a href="/forgot-password" style={{ fontSize: 13, color: '#8a9aa2', textDecoration: 'none', fontStyle: 'italic' }}>
              Forgot your password?
            </a>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '6px 0 4px' }} />

          {/* Submit */}
          <button type="submit" disabled={loading} className="lbtn"
            style={{
              width: '100%', padding: 16, border: 0, borderRadius: 12,
              background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)',
              color: '#fff', fontFamily: "'Outfit', sans-serif",
              fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 8px 20px -8px rgba(74,90,99,.55), inset 0 1px 0 rgba(255,255,255,.18)',
              opacity: loading ? 0.7 : 1,
            }}>
            {loading ? (
              <>
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" className="animate-spin">
                  <circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                Signing in...
              </>
            ) : (
              <>
                Login
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>

        </form>
      </main>
    </div>
  )
}
