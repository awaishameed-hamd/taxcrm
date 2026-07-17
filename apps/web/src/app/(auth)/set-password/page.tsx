'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import axios from 'axios'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

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

function SetPasswordForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [showCf,     setShowCf]     = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing invite link.')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      await axios.post(`${API}/auth/accept-invite`, { token, password })
      setDone(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  const bg = 'radial-gradient(1200px 700px at 20% 10%, #f3f6f8 0%, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4 0%, transparent 55%), linear-gradient(135deg, #eef1f3 0%, #dde3e7 50%, #cdd5da 100%)'

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ fontFamily: "'Aptos', sans-serif", background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 400, background: 'linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.75))', backdropFilter: 'blur(20px) saturate(1.1)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 22, padding: '44px 38px', boxShadow: '0 30px 60px -20px rgba(74,90,99,.35)', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px -4px rgba(74,90,99,0.45)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.45rem', fontWeight: 700, color: '#4a5a63', margin: '0 0 8px', letterSpacing: '-0.01em' }}>Password Set!</h2>
          <p style={{ color: '#8a9aa2', fontSize: '0.85rem', margin: '0 0 28px', letterSpacing: '.01em' }}>Your account is ready. You can now log in with your new password.</p>
          <button onClick={() => router.replace('/login')} style={{ width: '100%', padding: '14px 0', border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(74,90,99,.55)' }}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Aptos', sans-serif", background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', color: '#5d6f78', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 340, height: 340, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)', top: -80, left: -80, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: .55, zIndex: 0, width: 420, height: 420, background: 'radial-gradient(circle, #c2ccd2 0%, rgba(194,204,210,0) 70%)', bottom: -120, right: -100, pointerEvents: 'none' }} />

      <main style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 432, background: 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.7))', backdropFilter: 'blur(20px) saturate(1.1)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 22, padding: '44px 38px', boxShadow: '0 30px 60px -20px rgba(74,90,99,.35), 0 18px 36px -18px rgba(74,90,99,.25)' }}>

        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <Image src="/logo.png" alt="Asif Associates" width={1536} height={1024} priority
              style={{ width: 150, height: 'auto', filter: 'drop-shadow(0 12px 22px rgba(74,90,99,.3))' }} />
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', color: '#4a5a63', lineHeight: 1.1, margin: '0 0 10px' }}>
            Set Your Password
          </h1>
          <p style={{ fontSize: 13, letterSpacing: '.1em', color: '#8a9aa2', fontWeight: 600, margin: 0 }}>
            Create a password for your portal account
          </p>
        </header>

        {error && (
          <div style={{ marginBottom: 14, background: 'rgba(214,40,40,0.08)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* New Password */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9aa2', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>New Password</div>
            <div style={fieldStyle}>
              <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={inputStyle}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: 'transparent', border: 0, color: '#8a9aa2', cursor: 'pointer', padding: 6, marginRight: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {showPw
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  }
                </svg>
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9aa2', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Confirm Password</div>
            <div style={fieldStyle}>
              <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                type={showCf ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                style={inputStyle}
              />
              <button type="button" onClick={() => setShowCf(v => !v)} style={{ background: 'transparent', border: 0, color: '#8a9aa2', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {showCf
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  }
                </svg>
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #d4dade, transparent)', margin: '4px 0' }} />

          <button type="submit" disabled={loading || !token} style={{ width: '100%', padding: 16, border: 0, borderRadius: 12, background: 'linear-gradient(180deg, #5d6f78 0%, #4a5a63 100%)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', cursor: (loading || !token) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 20px -8px rgba(74,90,99,.55)', opacity: (loading || !token) ? 0.7 : 1 }}>
            {loading ? (
              <>
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" className="animate-spin">
                  <circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                Setting password...
              </>
            ) : 'Set Password'}
          </button>

        </form>
      </main>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  )
}
