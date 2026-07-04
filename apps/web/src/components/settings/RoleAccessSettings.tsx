'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'

const NAVY  = '#132E57'
const TEAL  = '#1E8496'
const GOLD  = '#F2AC18'
const SLATE = '#64748B'
const BORDER = '#E2E8F0'

const CONTROLLABLE_ROLES = ['PARTNER', 'MANAGER', 'TEAM_LEAD', 'TRAINEE']

const ROLE_LABEL: Record<string, string> = {
  PARTNER:   'Partner',
  MANAGER:   'Manager',
  TEAM_LEAD: 'Team Lead',
  TRAINEE:   'Trainee',
}

const ROLE_COLOR: Record<string, string> = {
  PARTNER:   GOLD,
  MANAGER:   NAVY,
  TEAM_LEAD: TEAL,
  TRAINEE:   '#7B2D8E',
}

// Category metadata
const CATEGORIES: { key: string; label: string; icon: string; color: string; features: string[] }[] = [
  {
    key: 'dashboard', label: 'Dashboard', color: NAVY,
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    features: ['dashboard'],
  },
  {
    key: 'clients', label: 'Clients', color: '#3A6B3A',
    icon: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
    features: ['clients', 'clients_create', 'clients_edit', 'representatives', 'representatives_create', 'representatives_edit'],
  },
  {
    key: 'tasks', label: 'Tasks', color: '#C25A1F',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    features: ['tasks', 'completed_tasks', 'incomplete_tasks', 'task_approval', 'task_delete', 'task_mark_incomplete'],
  },
  {
    key: 'team', label: 'My Team', color: TEAL,
    icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
    features: ['team', 'team_create', 'team_edit'],
  },
  {
    key: 'messages', label: 'Communication', color: '#1E8496',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    features: ['messages'],
  },
  {
    key: 'attendance', label: 'Attendance', color: '#CBB26A',
    icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
    features: ['my_attendance', 'attendance_report', 'attendance_approval', 'daily_attendance', 'working_days'],
  },
  {
    key: 'tax_summary', label: 'Tax Summary', color: '#7B2D8E',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    features: ['tax_summary'],
  },
  {
    key: 'profile', label: 'Profile', color: '#CBB26A',
    icon: 'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
    features: ['my_profile'],
  },
]

interface FeatureDef { label: string; roles: string[] }
interface PermRow    { id: string; role: string; feature: string; enabled: boolean }

function buildMatrix(rows: PermRow[]): Record<string, Record<string, boolean>> {
  const m: Record<string, Record<string, boolean>> = {}
  for (const r of rows) {
    if (!m[r.role]) m[r.role] = {}
    m[r.role][r.feature] = r.enabled
  }
  return m
}

function Toggle({
  checked, onChange, loading, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !loading && !disabled && onChange(!checked)}
      title={disabled ? 'Not applicable for this role' : checked ? 'Enabled — click to disable' : 'Disabled — click to enable'}
      style={{
        width: 42, height: 22, borderRadius: 11, border: 'none', padding: 0,
        background: disabled ? '#E2E8F0' : checked ? TEAL : '#CBD5E1',
        cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0, opacity: disabled ? 0.35 : 1,
      }}
    >
      <span style={{
        display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: checked && !disabled ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
      {loading && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{
            width: 9, height: 9, border: '2px solid rgba(255,255,255,0.5)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }} />
        </span>
      )}
    </button>
  )
}

export default function RoleAccessSettings() {
  const [features, setFeatures] = useState<Record<string, FeatureDef>>({})
  const [matrix,   setMatrix]   = useState<Record<string, Record<string, boolean>>>({})
  const [loading,  setLoading]  = useState(true)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [fRes, pRes] = await Promise.all([
        api.get('/role-permissions/features'),
        api.get('/role-permissions'),
      ])
      setFeatures(fRes.data?.data ?? fRes.data ?? {})
      setMatrix(buildMatrix(pRes.data?.data ?? pRes.data ?? []))
    } catch {
      setError('Failed to load permissions. Please refresh.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (role: string, feature: string, next: boolean) => {
    const key = `${role}:${feature}`
    setToggling(prev => new Set(prev).add(key))
    setMatrix(prev => ({ ...prev, [role]: { ...(prev[role] ?? {}), [feature]: next } }))
    try {
      await api.patch(`/role-permissions/${role}/${feature}`, { enabled: next })
      showToast(`${ROLE_LABEL[role]} — ${next ? 'enabled' : 'disabled'}`, true)
    } catch {
      setMatrix(prev => ({ ...prev, [role]: { ...(prev[role] ?? {}), [feature]: !next } }))
      showToast('Failed to update permission', false)
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: SLATE, fontFamily: "'Aptos', sans-serif", fontSize: 14 }}>
      Loading permissions…
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#FEF2F2', border: `1px solid #FECACA`, borderRadius: 10, color: '#B91C1C', fontFamily: "'Aptos', sans-serif", fontSize: 13 }}>
      {error}
      <button onClick={load} style={{ marginLeft: 'auto', padding: '5px 14px', borderRadius: 7, border: '1px solid #B91C1C', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
        Retry
      </button>
    </div>
  )

  // Column widths: 1fr feature label + 4 role columns
  const COLS = `1fr repeat(${CONTROLLABLE_ROLES.length}, 110px)`

  return (
    <div style={{ fontFamily: "'Aptos', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? '#166534' : '#B91C1C', color: '#fff',
          padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>{toast.msg}</div>
      )}

      {/* Table */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>

        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: COLS,
          background: '#7EC8D0', padding: '12px 20px', alignItems: 'center',
          borderBottom: `1px solid #5BBAC4`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase', color: NAVY, fontFamily: "'Ethnocentric Rg', sans-serif" }}>
            Feature
          </div>
          {CONTROLLABLE_ROLES.map(role => (
            <div key={role} style={{ textAlign: 'center' }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 300,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff',
                background: ROLE_COLOR[role],
                padding: '4px 12px', borderRadius: 20,
                fontFamily: "'Rajdhani', sans-serif", fontStyle: 'normal',
              }}>
                {ROLE_LABEL[role]}
              </span>
            </div>
          ))}
        </div>

        {/* Categories */}
        {CATEGORIES.map((cat, catIdx) => {
          // Only show features that exist in the features API response
          const catFeatures = cat.features.filter(f => features[f])
          if (catFeatures.length === 0) return null
          return (
            <div key={cat.key}>
              {/* Section heading — like "Personal Information" */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#F4F6FA',
                padding: '10px 20px',
                borderTop: catIdx > 0 ? `2px solid ${BORDER}` : undefined,
              }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6,
                  background: cat.color + '18',
                  flexShrink: 0,
                }}>
                  <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke={cat.color} strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                  </svg>
                </span>
                <span style={{
                  fontFamily: "'Aptos', sans-serif", fontSize: 13, fontWeight: 700,
                  color: NAVY, letterSpacing: '0.01em',
                }}>
                  {cat.label}
                </span>
                <span style={{ flex: 1, height: 1, background: BORDER, marginLeft: 4 }} />
              </div>

              {/* Feature rows */}
              {catFeatures.map((featKey, rowIdx) => {
                const def = features[featKey]
                if (!def) return null
                return (
                  <div key={featKey} style={{
                    display: 'grid', gridTemplateColumns: COLS,
                    padding: '11px 20px', alignItems: 'center',
                    background: rowIdx % 2 === 0 ? '#fff' : '#FAFBFC',
                    borderTop: `1px solid ${BORDER}`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
                      {def.label}
                    </div>
                    {CONTROLLABLE_ROLES.map(role => {
                      const applicable = def.roles.includes(role)
                      const enabled    = applicable ? (matrix[role]?.[featKey] ?? false) : false
                      const tKey       = `${role}:${featKey}`
                      return (
                        <div key={role} style={{ display: 'flex', justifyContent: 'center' }}>
                          <Toggle
                            checked={enabled}
                            onChange={next => handleToggle(role, featKey, next)}
                            loading={toggling.has(tKey)}
                            disabled={!applicable}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
