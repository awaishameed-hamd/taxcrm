'use client'

import { useState, useEffect, useCallback, useRef } from 'react' // useCallback used in fetchUsers
import { useAuth, usePermission } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import UserProfileModal from './UserProfileModal'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeamUser {
  id:        string
  userCode:  string
  fullName:  string
  email:     string
  phone:     string | null
  role:      string
  isActive:  boolean
  createdAt: string
  teamLead?: { id: string; fullName: string } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLE_HIERARCHY = ['ADMIN', 'PARTNER', 'MANAGER', 'TEAM_LEAD', 'TRAINEE']

const ROLE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  ADMIN:     { bg: '#EDE9FE', color: '#6D28D9', label: 'Admin'     },
  PARTNER:   { bg: '#FEF3C7', color: '#92400E', label: 'Partner'   },
  MANAGER:   { bg: '#DBEAFE', color: '#1D4ED8', label: 'Manager'   },
  TEAM_LEAD: { bg: '#D1FAE5', color: '#065F46', label: 'Team Lead' },
  TRAINEE:   { bg: '#CFFAFE', color: '#0E7490', label: 'Trainee'   },
  CLIENT:    { bg: '#F3F4F6', color: '#6B7280', label: 'Client'    },
}

const ALL_COLS = [
  { key: 'userCode',  label: 'User ID'   },
  { key: 'name',      label: 'Name'      },
  { key: 'role',      label: 'Role'      },
  { key: 'teamLead',  label: 'Team Lead' },
  { key: 'email',     label: 'Email'     },
  { key: 'phone',     label: 'Phone'     },
  { key: 'joined',    label: 'Joined'    },
  { key: 'status',    label: 'Status'    },
]
const ALL_COL_KEYS = ALL_COLS.map(c => c.key)

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Column picker ─────────────────────────────────────────────────────────────
function ColumnPicker({ visible, onChange }: { visible: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const allSelected = visible.length === ALL_COLS.length
  const toggle = (key: string) => {
    if (visible.includes(key) && visible.length === 1) return
    onChange(visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key])
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        background: open ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
        fontFamily: '"Aptos", sans-serif', letterSpacing: '0.06em',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3.75 9h16.5M3.75 15h16.5" />
        </svg>
        Columns {visible.length < ALL_COLS.length && `(${visible.length}/${ALL_COLS.length})`}
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50,
          background: '#0D1B2A', border: '1px solid #3F4753', borderRadius: 10,
          overflow: 'hidden', width: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
            cursor: 'pointer', borderBottom: '1px solid #3F4753', background: 'rgba(30,132,150,0.15)',
          }}>
            <input type="checkbox" checked={allSelected}
              onChange={() => onChange(allSelected ? [ALL_COL_KEYS[0]] : ALL_COL_KEYS)}
              style={{ accentColor: P.teal, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FBDCB4', letterSpacing: '0.06em' }}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </label>
          {ALL_COLS.map(col => (
            <label key={col.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              cursor: 'pointer',
            }}>
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)}
                style={{ accentColor: P.teal, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: visible.includes(col.key) ? '#FBDCB4' : '#9FA7B2' }}>
                {col.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmColor, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; confirmColor: string
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,46,87,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', padding: 28 }}>
        <h3 style={{ margin: '0 0 8px', fontFamily: '"Aptos", sans-serif', fontSize: 16, fontWeight: 800, color: P.navy }}>{title}</h3>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: P.textMuted, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: confirmColor, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamListPage() {
  const { user: authUser } = useAuth()

  const canCreatePerm  = usePermission('team_create')
  const canEditPerm    = usePermission('team_edit')

  const myRoleIdx      = ROLE_HIERARCHY.indexOf(authUser?.role ?? '')
  const creatableRoles = myRoleIdx >= 0 ? ROLE_HIERARCHY.slice(myRoleIdx + 1) : []
  const canCreate      = creatableRoles.length > 0 && canCreatePerm
  const canManageUser  = (u: TeamUser) => ROLE_HIERARCHY.indexOf(u.role) > myRoleIdx && canEditPerm
  // Permanent delete: only Admin, Partner and Manager, and only on someone below
  // them. Mirrors the API guard so no button appears that would just error.
  const canDeleteUser  = (u: TeamUser) =>
    canManageUser(u) && ['ADMIN', 'PARTNER', 'MANAGER'].includes(authUser?.role ?? '')

  // ── Filter state ──────────────────────────────────────────────────────────
  const [roleFilter,   setRoleFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search,       setSearch]       = useState('')
  const [visibleCols,  setVisibleCols]  = useState(ALL_COL_KEYS)

  // Resizable columns
  const COL_DEFAULT_WIDTHS: Record<string, number> = {
    userCode: 100, name: 180, role: 110, teamLead: 150, email: 200, phone: 130, joined: 120, status: 90,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(COL_DEFAULT_WIDTHS)
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = { key, startX: e.clientX, startW: colWidths[key] }
    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return
      const newW = Math.max(50, resizingCol.current.startW + ev.clientX - resizingCol.current.startX)
      setColWidths(prev => ({ ...prev, [resizingCol.current!.key]: newW }))
    }
    const onUp = () => {
      resizingCol.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [colWidths])

  // ── Data state ────────────────────────────────────────────────────────────
  const [users,   setUsers]   = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showCreate,   setShowCreate]   = useState(false)
  const [editUserId,   setEditUserId]   = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ user: TeamUser; type: 'disable' | 'enable' | 'delete' } | null>(null)
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params: any = { status: statusFilter }
      if (roleFilter) params.role   = roleFilter
      if (search)     params.search = search
      const { data } = await api.get('/users', { params })
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      const filtered = list.filter((u: TeamUser) => u.role !== 'CLIENT')
      filtered.sort((a: TeamUser, b: TeamUser) =>
        ROLE_HIERARCHY.indexOf(a.role) - ROLE_HIERARCHY.indexOf(b.role)
      )
      setUsers(filtered)
    } catch {
      if (!silent) setToast({ msg: 'Failed to load team members.', ok: false })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [roleFilter, statusFilter, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useAutoRefresh(() => fetchUsers(true))

  // ── Toggle Active ─────────────────────────────────────────────────────────
  async function handleToggleActive() {
    if (!confirmModal) return
    const u = confirmModal.user
    setConfirmModal(null)
    try {
      await api.patch(`/users/${u.id}/toggle-active`)
      setToast({ msg: `${u.fullName} ${u.isActive ? 'disabled' : 'enabled'}.`, ok: true })
      fetchUsers()
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.message ?? 'Action failed.', ok: false })
    }
  }

  // ── Permanent delete ──────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirmModal) return
    const u = confirmModal.user
    setConfirmModal(null)
    try {
      await api.delete(`/users/${u.id}`)
      setToast({ msg: `${u.fullName} deleted permanently.`, ok: true })
      fetchUsers()
    } catch (err: any) {
      // The API refuses when the user still has linked work and says which, so
      // show that reason rather than a generic failure.
      const m = err?.response?.data?.message
      setToast({ msg: Array.isArray(m) ? m.join(', ') : m ?? 'Delete failed.', ok: false })
    }
  }

  // ── Visible roles for filter tabs ─────────────────────────────────────────
  const visibleFilterRoles = ROLE_HIERARCHY.filter((_, i) => i >= myRoleIdx && myRoleIdx >= 0)

  // ── Render ────────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: '7px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    textTransform: 'uppercase', color: '#1a1a1a', fontFamily: '"Aptos", sans-serif',
    letterSpacing: '0.07em', background: 'transparent', whiteSpace: 'nowrap',
    position: 'relative', userSelect: 'none', overflow: 'hidden',
  }

  return (
    <div style={{ padding: '0 20px 20px', minHeight: '100vh', background: P.bgMain }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? '#E8F5E9' : '#FFEBEE',
          border: `1px solid ${toast.ok ? '#A5D6A7' : '#FFCDD2'}`,
          color: toast.ok ? '#2E7D32' : '#C62828',
          padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <UserProfileModal
          creatableRoles={creatableRoles}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setToast({ msg: 'User created successfully.', ok: true }); fetchUsers() }}
        />
      )}
      {editUserId && (
        <UserProfileModal
          userId={editUserId}
          creatableRoles={creatableRoles}
          onClose={() => setEditUserId(null)}
          onSuccess={() => { setToast({ msg: 'User updated successfully.', ok: true }); fetchUsers() }}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          title={
            confirmModal.type === 'delete'  ? `Permanently delete "${confirmModal.user.fullName}"?`
            : confirmModal.type === 'disable' ? `Disable "${confirmModal.user.fullName}"?`
            : `Enable "${confirmModal.user.fullName}"?`}
          message={
            confirmModal.type === 'delete'  ? 'This removes the account and everything tied to it, and cannot be undone. It is refused only if the user still has a linked task. Any clients or incharge duties will need reassigning afterward.'
            : confirmModal.type === 'disable' ? 'This user will no longer be able to log in.'
            : 'This user will regain access to the system.'}
          confirmLabel={confirmModal.type === 'delete' ? 'Delete' : confirmModal.type === 'disable' ? 'Disable' : 'Enable'}
          confirmColor={confirmModal.type === 'enable' ? '#16A34A' : '#DC2626'}
          onConfirm={confirmModal.type === 'delete' ? handleDelete : handleToggleActive}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52, marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: '#1E8496', fontFamily: "'Faster One', cursive", display: 'inline-block' }}>
            MY TEAM
          </h1>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 9, border: 0,
              background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`,
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New User
          </button>
        )}
      </div>

      {/* ── Filters Bar ── */}
      <div style={{ background: '#EDF0F3', padding: '0', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px' }}>

          {/* Role dropdown */}
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 30, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif',
            background: roleFilter !== '' ? P.navy : 'rgba(255,255,255,0.18)', color: '#fff',
            outline: 'none', appearance: 'none', paddingRight: 24,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}>
            <option value="" style={{ background: P.navy }}>All Roles</option>
            {visibleFilterRoles.map(r => (
              <option key={r} value={r} style={{ background: P.navy }}>
                {r === 'TEAM_LEAD' ? 'Team Lead' : r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Status pills */}
          {([['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val)} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif',
              transition: 'all .15s', whiteSpace: 'nowrap',
              background: statusFilter === val ? P.navy : 'transparent',
              color: statusFilter === val ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>
              {label}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Search */}
          <div style={{ position: 'relative', width: 200, flexShrink: 0 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff' }} />
          </div>

          {/* Column picker */}
          <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />

          {/* Count */}
          <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', paddingLeft: 4, paddingRight: 4, marginLeft: 'auto' }}>
            {users.length} user{users.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
            <colgroup>
              {ALL_COLS.filter(c => visibleCols.includes(c.key)).map(c => (
                <col key={c.key} style={{ width: colWidths[c.key] }} />
              ))}
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                {ALL_COLS.filter(c => visibleCols.includes(c.key)).map(col => (
                  <th key={col.key} style={thStyle}>
                    {col.label}
                    <span onMouseDown={e => onResizeStart(col.key, e)} style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                      cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                    }}>
                      <span style={{ width: 2, height: '55%', background: 'rgba(0,0,0,0.2)', borderRadius: 2 }} />
                    </span>
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                    {Array.from({ length: visibleCols.length + 1 }).map((__, j) => (
                      <td key={j} style={{ padding: '6px 14px', borderBottom: `1px solid ${P.border}50` }}>
                        <div style={{ height: 12, borderRadius: 4, background: '#E5EAF0', animation: 'pulse 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
                : users.length === 0
                  ? (
                    <tr>
                      <td colSpan={visibleCols.length + 1} style={{ padding: '56px 16px', textAlign: 'center', color: P.textMuted, fontSize: 14 }}>
                        No team members found.
                      </td>
                    </tr>
                  )
                  : users.map((u, idx) => {
                    const badge     = ROLE_BADGE[u.role] ?? { bg: '#F3F4F6', color: '#6B7280', label: u.role }
                    const isInactive = !u.isActive
                    return (
                      <tr key={u.id} style={{
                        background: idx % 2 === 0 ? '#fff' : '#FAFCFC',
                        borderBottom: `1px solid ${P.border}50`,
                        opacity: isInactive ? 0.65 : 1,
                      }}>

                        {visibleCols.includes('userCode') && (
                          <td style={{ padding: '6px 14px' }}>
                            <span style={{ fontFamily: '"Aptos", sans-serif', fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>
                              {u.userCode}
                            </span>
                          </td>
                        )}

                        {visibleCols.includes('name') && (
                          <td style={{ padding: '6px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: '50%',
                                background: isInactive ? '#9CA3AF' : P.navy,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                              }}>
                                {u.fullName[0]?.toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 600, color: P.textHeading }}>{u.fullName}</span>
                            </div>
                          </td>
                        )}

                        {visibleCols.includes('role') && (
                          <td style={{ padding: '6px 14px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                              borderRadius: 9999, fontSize: 11, fontWeight: 700,
                              background: badge.bg, color: badge.color,
                            }}>
                              {badge.label}
                            </span>
                          </td>
                        )}

                        {visibleCols.includes('teamLead') && (
                          <td style={{ padding: '6px 14px', color: P.textMuted, fontSize: 12 }}>
                            {u.teamLead?.fullName ?? ''}
                          </td>
                        )}

                        {visibleCols.includes('email') && (
                          <td style={{ padding: '6px 14px', color: P.textMuted, fontSize: 12 }}>{u.email}</td>
                        )}

                        {visibleCols.includes('phone') && (
                          <td style={{ padding: '6px 14px', color: P.textMuted, fontSize: 12 }}>{u.phone ?? ''}</td>
                        )}

                        {visibleCols.includes('joined') && (
                          <td style={{ padding: '6px 14px', color: P.textMuted, fontSize: 12 }}>{fmt(u.createdAt)}</td>
                        )}

                        {visibleCols.includes('status') && (
                          <td style={{ padding: '6px 14px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                              borderRadius: 9999, fontSize: 11, fontWeight: 600,
                              background: isInactive ? '#FFEBEE' : '#E8F5E9',
                              color:      isInactive ? '#C62828' : '#2E7D32',
                            }}>
                              {isInactive ? 'Inactive' : 'Active'}
                            </span>
                          </td>
                        )}

                        {/* Actions */}
                        <td style={{ padding: '6px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>

                            {/* Edit, only if current user outranks this user */}
                            {canManageUser(u) && (
                              <button onClick={() => setEditUserId(u.id)}
                                title="Edit"
                                style={{
                                  padding: 6, borderRadius: 7, border: 0, cursor: 'pointer',
                                  background: 'transparent', color: P.textMuted,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; (e.currentTarget as HTMLElement).style.color = '#1D4ED8' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = P.textMuted }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                                </svg>
                              </button>
                            )}

                            {/* Disable / Enable */}
                            {canManageUser(u) && (
                              <button
                                onClick={() => setConfirmModal({ user: u, type: isInactive ? 'enable' : 'disable' })}
                                title={isInactive ? 'Enable user' : 'Disable user'}
                                style={{
                                  padding: 6, borderRadius: 7, border: 0, cursor: 'pointer',
                                  background: 'transparent', color: P.textMuted,
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLElement).style.background = isInactive ? '#F0FDF4' : '#FEF2F2'
                                  ;(e.currentTarget as HTMLElement).style.color = isInactive ? '#16A34A' : '#DC2626'
                                }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = P.textMuted }}>
                                {isInactive
                                  ? (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                  )
                                  : (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                                    </svg>
                                  )
                                }
                              </button>
                            )}

                            {/* Permanent delete, Admin/Partner/Manager only */}
                            {canDeleteUser(u) && (
                              <button
                                onClick={() => setConfirmModal({ user: u, type: 'delete' })}
                                title="Delete permanently"
                                style={{
                                  padding: 6, borderRadius: 7, border: 0, cursor: 'pointer',
                                  background: 'transparent', color: P.textMuted,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLElement).style.color = '#B91C1C' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = P.textMuted }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            )}
                          </div>
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

