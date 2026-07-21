'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useAuth } from '@/contexts/AuthContext'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const SALES_TAX_AUTHORITIES = ['FBR', 'PRA', 'SRB', 'KPRA', 'BRA', 'AJK']

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${P.border}`, fontSize: 13, outline: 'none', fontFamily: F,
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#5C5C5C', marginBottom: 4, fontFamily: F,
}

type LoginDetail = {
  id: string
  authority: string
  loginId: string | null
  password: string | null
  clientId: string
  client: { id: string; businessName: string | null; user: { fullName: string; isActive: boolean } }
}

function EditModal({ row, isNew, onClose, onSaved }: {
  row: LoginDetail | null; isNew: boolean
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const [businessName, setBusinessName] = useState('')
  const [authority,    setAuthority]    = useState(row?.authority ?? 'FBR')
  const [loginId,      setLoginId]      = useState(row?.loginId ?? '')
  const [password,     setPassword]     = useState(row?.password ?? '')
  const [saving,        setSaving]      = useState(false)
  const [error,         setError]       = useState('')

  const canSubmit = isNew ? (!!businessName.trim() && !!user?.id) : true

  async function submit() {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      if (isNew) {
        await api.post('/client-login-details', {
          businessName: businessName.trim(), traineeId: user!.id, authority, loginId: loginId || undefined, password: password || undefined,
        })
      } else {
        await api.patch(`/client-login-details/${row!.id}`, { authority, loginId, password })
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: F }}>
          {isNew ? 'Add Login Detail' : 'Edit Login Detail'}
        </h3>

        {isNew && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Client Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Business name" style={inputStyle} />
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Authority <span style={{ color: '#ef4444' }}>*</span></label>
          <StyledSelect value={authority} onChange={setAuthority}
            options={SALES_TAX_AUTHORITIES.map(a => ({ value: a, label: a }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Login ID</label>
            <input value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="IRIS login ID" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="IRIS password" style={inputStyle} />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, color: '#475569' }}>Cancel</button>
          <button onClick={submit} disabled={saving || !canSubmit}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: TEAL, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F, opacity: (saving || !canSubmit) ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LoginDetailsPage() {
  const [rows,          setRows]          = useState<LoginDetail[]>([])
  const [loading,       setLoading]       = useState(true)
  const [searchInput,   setSearchInput]   = useState('')
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<'active' | 'inactive' | 'all'>('active')
  const [editRow,       setEditRow]       = useState<LoginDetail | null>(null)
  const [showAdd,       setShowAdd]       = useState(false)

  const [toggling,      setToggling]      = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<LoginDetail | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  const fetchRows = useCallback((q?: string, silent = false) => {
    if (!silent) setLoading(true)
    api.get('/client-login-details', { params: q ? { search: q } : undefined })
      .then(({ data }) => setRows(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [])

  useAutoRefresh(() => fetchRows(search || undefined, true))

  useEffect(() => { fetchRows() }, [fetchRows])

  async function toggleClientActive(r: LoginDetail) {
    setToggling(r.id)
    try {
      await api.patch(`/clients/${r.clientId}/toggle-active`)
      fetchRows(search || undefined)
    } catch { /* silent */ }
    finally { setToggling(null) }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await api.delete(`/client-login-details/${deleteConfirm.id}`)
      setDeleteConfirm(null)
      fetchRows(search || undefined)
    } catch { /* silent */ }
    finally { setDeleting(false) }
  }

  const visibleRows = rows.filter(r => {
    const active = r.client?.user?.isActive !== false
    if (statusFilter === 'active')   return active
    if (statusFilter === 'inactive') return !active
    return true
  })

  const td: React.CSSProperties = { padding: '6px 14px', borderBottom: `1px solid ${P.border}50`, fontFamily: F, fontSize: 13, fontWeight: 700, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const na = <span style={{ color: '#CBD5E1' }}>N/A</span>

  return (
    {/* No top padding: the heading gets its own 52px band, the same height as the
        sidebar's brand header, so "Login Details" sits level with ASIF ASSOCIATES. */}
    <div style={{ padding: '0 24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 52, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 26, color: '#1E8496', fontFamily: "'Faster One', cursive", display: 'inline-block', lineHeight: 1.15 }}>Login Details</h2>
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px' }}>

          {/* Status pills */}
          {[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'All', value: 'all' }].map(({ label, value }) => (
            <button key={value} onClick={() => setStatusFilter(value as any)} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: F, transition: 'all .15s', whiteSpace: 'nowrap',
              background: statusFilter === value ? NAVY : 'transparent',
              color: statusFilter === value ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>
              {label}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 260 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search client…" value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setSearch(e.target.value); fetchRows(e.target.value || undefined) }}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
          </div>

          <span style={{ flex: 1 }} />

          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', paddingLeft: 4, paddingRight: 4 }}>{visibleRows.length} rows</span>

          <button onClick={() => setShowAdd(true)}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: F, background: NAVY, color: '#fff' }}>
            + Add
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '27%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              {['Client', 'Authority', 'Login ID', 'Password'].map(label => (
                <th key={label} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
              <th style={{ padding: '8px 14px' }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  {Array.from({ length: 5 }).map((__, c) => (
                    <td key={c} style={td}><div style={{ height: 12, borderRadius: 4, background: P.gridLine }} /></td>
                  ))}
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted }}>
                {search ? `No clients matching "${search}".` : 'No login details yet. Click + Add to create one.'}
              </td></tr>
            ) : visibleRows.map((r, idx) => {
              const isActive = r.client?.user?.isActive !== false
              return (
              <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC', opacity: isActive ? 1 : 0.55 }}>
                <td style={td}>{r.client?.businessName ?? r.client?.user?.fullName ?? na}</td>
                <td style={td}>{r.authority}</td>
                <td style={td}>{r.loginId ?? na}</td>
                <td style={td}>{r.password ?? na}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditRow(r)} title="Edit"
                      style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                    <button onClick={() => toggleClientActive(r)} disabled={toggling === r.id} title={isActive ? 'Deactivate client' : 'Activate client'}
                      style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: toggling === r.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#EF4444' : '#22C55E', opacity: toggling === r.id ? 0.5 : 1 }}
                      onMouseEnter={e => { e.currentTarget.style.background = isActive ? '#FEF2F2' : '#F0FDF4' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                      {isActive
                        ? <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      }
                    </button>
                    <button onClick={() => setDeleteConfirm(r)} title="Delete row"
                      style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editRow && (
        <EditModal row={editRow} isNew={false}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); fetchRows(search || undefined) }} />
      )}
      {showAdd && (
        <EditModal row={null} isNew
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchRows(search || undefined) }} />
      )}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#D62828', fontFamily: F }}>Delete this row?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: P.textMuted, fontFamily: F, lineHeight: 1.5 }}>
              This removes the {deleteConfirm.authority} login detail for <strong>{deleteConfirm.client?.businessName ?? deleteConfirm.client?.user?.fullName}</strong>. It does not delete the client.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, color: '#475569' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#D62828', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F, opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
