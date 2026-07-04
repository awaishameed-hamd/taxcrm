'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'

const NAVY = '#132E57'
const TEAL = '#1E8496'

const ROLE_ORDER = ['ADMIN', 'PARTNER', 'MANAGER', 'TEAM_LEAD', 'TRAINEE']
const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin', PARTNER: 'Partner', MANAGER: 'Manager', TEAM_LEAD: 'Team Lead', TRAINEE: 'Trainee',
}

interface UserEntry {
  id: string
  fullName: string
  userCode: string
  role: string
  attendanceApplicable: boolean
}

type Grouped = Record<string, UserEntry[]>

export default function AttendanceApplicabilitySettings() {
  const [grouped, setGrouped] = useState<Grouped>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState<string | null>(null)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    api.get('/attendance/applicability')
      .then(r => {
        const d = r.data?.data ?? r.data
        setGrouped(d ?? {})
      })
      .catch(() => showToast('Failed to load applicability settings', false))
      .finally(() => setLoading(false))
  }, [])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function toggleUser(user: UserEntry) {
    const key = `user-${user.id}`
    setBusy(key)
    try {
      await api.patch(`/attendance/applicability/user/${user.id}`, { applicable: !user.attendanceApplicable })
      setGrouped(prev => {
        const next = { ...prev }
        next[user.role] = next[user.role].map(u =>
          u.id === user.id ? { ...u, attendanceApplicable: !u.attendanceApplicable } : u
        )
        return next
      })
      showToast(`${user.fullName} attendance ${!user.attendanceApplicable ? 'enabled' : 'disabled'}`, true)
    } catch {
      showToast('Failed to update', false)
    } finally { setBusy(null) }
  }

  async function toggleRole(role: string, currentAll: boolean) {
    const key = `role-${role}`
    setBusy(key)
    const applicable = !currentAll
    try {
      await api.patch(`/attendance/applicability/role/${role}`, { applicable })
      setGrouped(prev => {
        const next = { ...prev }
        next[role] = (next[role] ?? []).map(u => ({ ...u, attendanceApplicable: applicable }))
        return next
      })
      showToast(`${ROLE_LABEL[role] ?? role} attendance ${applicable ? 'enabled' : 'disabled'} for all`, true)
    } catch {
      showToast('Failed to update', false)
    } finally { setBusy(null) }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: P.textMuted, fontSize: 14 }}>Loading…</div>
  )

  const roles = ROLE_ORDER.filter(r => grouped[r]?.length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? '#D1FAE5' : '#FEE2E2',
          border: `1px solid ${toast.ok ? '#6EE7B7' : '#FECACA'}`,
          color: toast.ok ? '#065F46' : '#B91C1C',
          padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          fontFamily: "'Aptos', sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>{toast.msg}</div>
      )}

      {roles.map(role => {
        const users = grouped[role] ?? []
        const allOn = users.every(u => u.attendanceApplicable)
        const anyOn = users.some(u => u.attendanceApplicable)
        const roleKey = `role-${role}`

        return (
          <div key={role} style={{
            background: '#fff', borderRadius: 10, border: `1px solid #E2E8F0`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
          }}>
            {/* Role header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 16px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1E293B', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>
                  {ROLE_LABEL[role] ?? role}
                </span>
                <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>
                  {users.filter(u => u.attendanceApplicable).length}/{users.length}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>
                  {allOn ? 'All on' : anyOn ? 'Partial' : 'All off'}
                </span>
                <Toggle on={allOn} partial={!allOn && anyOn} disabled={busy === roleKey} onChange={() => toggleRole(role, allOn)} />
              </div>
            </div>

            {/* User list */}
            <div>
              {users.map((user, i) => (
                <div key={user.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 16px',
                  borderBottom: i < users.length - 1 ? '1px solid #F1F5F9' : 'none',
                  opacity: user.attendanceApplicable ? 1 : 0.45,
                  transition: 'opacity .2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: user.attendanceApplicable ? TEAL + '18' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: user.attendanceApplicable ? TEAL : '#94A3B8',
                      fontFamily: "'Aptos', sans-serif", flexShrink: 0,
                    }}>
                      {user.fullName.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#374151', fontFamily: "'Aptos', sans-serif" }}>
                      {user.fullName}
                    </span>
                  </div>
                  <Toggle on={user.attendanceApplicable} disabled={busy === `user-${user.id}`} onChange={() => toggleUser(user)} />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {roles.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: P.textMuted, fontSize: 13 }}>No users found.</div>
      )}
    </div>
  )
}

function Toggle({ on, partial = false, disabled, onChange }: {
  on: boolean; partial?: boolean; disabled: boolean; onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? TEAL : partial ? '#FCD34D' : '#CBD5E1',
        position: 'relative', transition: 'background .2s', flexShrink: 0, padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left .2s',
      }} />
    </button>
  )
}
