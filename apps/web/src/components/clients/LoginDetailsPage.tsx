'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

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
  client: { id: string; businessName: string | null; user: { fullName: string } }
}

function EditModal({ row, isNew, staff, onClose, onSaved }: {
  row: LoginDetail | null; isNew: boolean; staff: any[]
  onClose: () => void; onSaved: () => void
}) {
  const [businessName, setBusinessName] = useState('')
  const [traineeId,    setTraineeId]    = useState('')
  const [authority,    setAuthority]    = useState(row?.authority ?? 'FBR')
  const [loginId,      setLoginId]      = useState(row?.loginId ?? '')
  const [password,     setPassword]     = useState(row?.password ?? '')
  const [saving,        setSaving]      = useState(false)
  const [error,         setError]       = useState('')

  const canSubmit = isNew ? (!!businessName.trim() && !!traineeId) : true

  async function submit() {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      if (isNew) {
        await api.post('/client-login-details', {
          businessName: businessName.trim(), traineeId, authority, loginId: loginId || undefined, password: password || undefined,
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
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Client Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Business name" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Assign To <span style={{ color: '#ef4444' }}>*</span></label>
              <StyledSelect value={traineeId} onChange={setTraineeId} placeholder="Select staff…"
                options={staff.map((s: any) => ({ value: s.id, label: s.fullName }))} />
            </div>
          </>
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
  const [staff,         setStaff]         = useState<any[]>([])
  const [editRow,       setEditRow]       = useState<LoginDetail | null>(null)
  const [showAdd,       setShowAdd]       = useState(false)

  const fetchRows = useCallback((q?: string, silent = false) => {
    if (!silent) setLoading(true)
    api.get('/client-login-details', { params: q ? { search: q } : undefined })
      .then(({ data }) => setRows(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [])

  useAutoRefresh(() => fetchRows(search || undefined, true))

  useEffect(() => {
    fetchRows()
    const fetchRole = (role: string) => api.get('/users', { params: { role } }).then(({ data }) => data.data ?? []).catch(() => [])
    Promise.all([fetchRole('MANAGER'), fetchRole('TEAM_LEAD'), fetchRole('TRAINEE')])
      .then(([managers, teamLeads, trainees]) => setStaff([...managers, ...teamLeads, ...trainees]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const td: React.CSSProperties = { padding: '10px 14px', borderBottom: `1px solid ${P.border}50`, fontFamily: F, fontSize: 13 }
  const na = <span style={{ color: '#CBD5E1' }}>N/A</span>

  return (
    <div style={{ padding: '20px 24px' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 900, color: NAVY, fontFamily: F }}>Login Details</h2>

      {/* Filter bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 260 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search client…" value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setSearch(e.target.value); fetchRows(e.target.value || undefined) }}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
          </div>

          <span style={{ flex: 1 }} />

          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', paddingLeft: 4, paddingRight: 4 }}>{rows.length} rows</span>

          <button onClick={() => setShowAdd(true)}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: F, background: NAVY, color: '#fff' }}>
            + Add
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              {['Client', 'Authority', 'Login ID', 'Password'].map(label => (
                <th key={label} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
              <th style={{ padding: '10px 14px' }} />
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
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted }}>
                {search ? `No clients matching "${search}".` : 'No login details yet. Click + Add to create one.'}
              </td></tr>
            ) : rows.map((r, idx) => (
              <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                <td style={{ ...td, fontWeight: 700, color: P.teal }}>{r.client?.businessName ?? r.client?.user?.fullName ?? na}</td>
                <td style={{ ...td, color: P.textMuted }}>{r.authority}</td>
                <td style={{ ...td, color: P.textMuted }}>{r.loginId ?? na}</td>
                <td style={{ ...td, color: P.textMuted }}>{r.password ?? na}</td>
                <td style={td}>
                  <button onClick={() => setEditRow(r)} title="Edit"
                    style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editRow && (
        <EditModal row={editRow} isNew={false} staff={staff}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); fetchRows(search || undefined) }} />
      )}
      {showAdd && (
        <EditModal row={null} isNew staff={staff}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchRows(search || undefined) }} />
      )}
    </div>
  )
}
