'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth, usePermission } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const NAVY  = '#132E57'
const TEAL  = '#1E8496'

// ── Column definitions ────────────────────────────────────────────────────────
const ALL_CLIENT_COLS = [
  { key: 'business',       label: 'Business',        defaultWidth: 150 },
  { key: 'ntn',            label: 'NTN',             defaultWidth: 110 },
  { key: 'strn',           label: 'STRN',            defaultWidth: 110 },
  { key: 'yearEnd',        label: 'Year End',         defaultWidth: 120 },
  { key: 'trainee',        label: 'Firm Rep.',        defaultWidth: 130 },
  { key: 'representative', label: 'Representative',  defaultWidth: 150 },
  { key: 'status',         label: 'Status',          defaultWidth: 90  },
]
const ALL_CLIENT_COL_KEYS = ALL_CLIENT_COLS.map(c => c.key)

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_CLIENT_COLS   = 'crm_client_visible_cols'
const LS_CLIENT_WIDTHS = 'crm_client_col_widths'
const LS_REP_COLS      = 'crm_rep_visible_cols'
const LS_REP_WIDTHS    = 'crm_rep_col_widths'

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── Column Picker (same style as TeamListPage) ────────────────────────────────
function ColumnPicker({ visible, onChange }: { visible: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const allSelected = visible.length === ALL_CLIENT_COLS.length
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
        Columns {visible.length < ALL_CLIENT_COLS.length && `(${visible.length}/${ALL_CLIENT_COLS.length})`}
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50,
          background: '#0D1B2A', border: '1px solid #3F4753', borderRadius: 10,
          overflow: 'hidden', width: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #3F4753', background: 'rgba(30,132,150,0.15)' }}>
            <input type="checkbox" checked={allSelected}
              onChange={() => onChange(allSelected ? [ALL_CLIENT_COL_KEYS[0]] : ALL_CLIENT_COL_KEYS)}
              style={{ accentColor: TEAL, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FBDCB4', letterSpacing: '0.06em' }}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </label>
          {ALL_CLIENT_COLS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)}
                style={{ accentColor: TEAL, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: visible.includes(col.key) ? '#FBDCB4' : '#9FA7B2' }}>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// Fields stored on User or ClientProfile columns (not in extraFields JSON)
const NATIVE_KEYS = new Set([
  'fullName', 'email', 'phone',
  'cnic', 'dateOfBirth', 'address', 'city', 'province',
  'ntn', 'strn', 'businessName', 'businessType', 'traineeId',
])

const COL_SPAN_MAP: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }

const inputCls = 'w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition'
const inputStyle = { borderColor: '#CBD5E1', color: NAVY, background: '#fff', fontFamily: "'Aptos', sans-serif" }
const inputFocusStyle = { borderColor: TEAL, boxShadow: '0 0 0 3px rgba(30,132,150,0.12)' }

// ── Field rendering helper ────────────────────────────────────────────────────
function DynamicField({ field, value, onChange, error, trainees, disabled }: {
  field: Record<string, any>
  value: string
  onChange: (key: string, val: string) => void
  error?: string
  trainees?: any[]
  disabled?: boolean
}) {
  const key = field.fieldKey || field.field_key
  const span = COL_SPAN_MAP[field.colSpan || field.col_span || 'third'] ?? 3
  const fieldType = field.fieldType || field.field_type || 'text'
  const isRequired = field.isRequired ?? field.is_required ?? false
  const placeholder = field.placeholder ?? ''

  let input: React.ReactNode

  const selectArrow = (
    <svg style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  )
  const selStyle = { ...inputStyle, appearance: 'none' as const, paddingRight: 36 }

  if (key === 'traineeId') {
    input = (
      <StyledSelect
        value={value}
        onChange={v => onChange(key, v)}
        placeholder="Unassigned"
        options={[{ value: '', label: 'Unassigned' }, ...(trainees ?? []).map((t: any) => ({ value: t.id, label: t.fullName }))]}
      />
    )
  } else if (key === 'province' && fieldType === 'select') {
    const opts = Array.isArray(field.options) ? field.options : ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'Islamabad', 'AJK']
    input = (
      <StyledSelect
        value={value}
        onChange={v => onChange(key, v)}
        placeholder="Select…"
        options={[{ value: '', label: 'Select…' }, ...opts.map((o: string) => ({ value: o, label: o }))]}
      />
    )
  } else if (fieldType === 'select') {
    input = (
      <StyledSelect
        value={value}
        onChange={v => onChange(key, v)}
        placeholder="Select…"
        options={[{ value: '', label: 'Select…' }, ...(field.options ?? []).map((o: string) => ({ value: o, label: o }))]}
      />
    )
  } else if (fieldType === 'date') {
    input = (
      <input type="date" value={value} onChange={e => onChange(key, e.target.value)}
        className={inputCls} style={inputStyle} />
    )
  } else if (fieldType === 'textarea') {
    input = (
      <textarea value={value} onChange={e => onChange(key, e.target.value)}
        rows={field.textareaRows || field.textarea_rows || 2} placeholder={placeholder}
        className={inputCls} style={{ ...inputStyle, resize: 'none' }} />
    )
  } else if (fieldType === 'number') {
    input = (
      <input type="number" value={value} onChange={e => onChange(key, e.target.value)}
        placeholder={placeholder} className={inputCls} style={inputStyle} />
    )
  } else if (fieldType === 'amount_pkr') {
    input = (
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <span style={{ padding: '0 8px 0 10px', color: '#94A3B8', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1 }}>Rs</span>
        <input type="text" inputMode="decimal" value={value} onChange={e => onChange(key, e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder={placeholder || '0.00'}
          style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 10px 10px 0', fontSize: 14, color: NAVY, background: 'transparent', fontFamily: "'Aptos', sans-serif", minWidth: 0 }} />
      </div>
    )
  } else if (fieldType === 'grouped_multiselect') {
    const selected: string[] = value
      ? (value.startsWith('[') ? (() => { try { return JSON.parse(value) } catch { return [] } })() : value.split(',').filter(Boolean))
      : []
    type GItem = string | { label: string; sub: string[] }
    const groups: { group: string; items: GItem[] }[] = Array.isArray(field.options) ? field.options : []
    const toggleSvc = (item: string) => {
      const next = selected.includes(item) ? selected.filter((s: string) => s !== item) : [...selected, item]
      onChange(key, JSON.stringify(next))
    }
    // toggle parent: if unchecking, remove all its subs; if checking, expand (don't auto-select subs)
    const toggleParent = (item: { label: string; sub: string[] }) => {
      const anySubSelected = item.sub.some((s: string) => selected.includes(s))
      if (anySubSelected) {
        // uncheck all subs
        onChange(key, JSON.stringify(selected.filter((s: string) => !item.sub.includes(s))))
      }
      // if no sub selected yet, just let the accordion open (handled by expanded state)
    }
    input = (
      <div style={{ border: '1px solid #CBD5E1', borderRadius: 10, background: '#F8FAFC', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map(g => (
          <div key={g.group}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEAL, marginBottom: 8, fontFamily: "'Aptos', sans-serif" }}>{g.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map(item => {
                if (typeof item === 'string') {
                  const active = selected.includes(item)
                  return (
                    <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' as const }}>
                      <input type="checkbox" checked={active} onChange={() => toggleSvc(item)}
                        style={{ width: 15, height: 15, accentColor: TEAL, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? NAVY : '#475569', fontFamily: "'Aptos', sans-serif" }}>{item}</span>
                    </label>
                  )
                }
                // parent item with expandable sub-checkboxes
                const anySubSelected = item.sub.some((s: string) => selected.includes(s))
                const subCount = item.sub.filter((s: string) => selected.includes(s)).length
                return (
                  <div key={item.label}>
                    {/* Parent checkbox row */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' as const }}>
                      <input type="checkbox" checked={anySubSelected}
                        onChange={() => toggleParent(item)}
                        style={{ width: 15, height: 15, accentColor: TEAL, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: anySubSelected ? 700 : 400, color: anySubSelected ? NAVY : '#475569', fontFamily: "'Aptos', sans-serif" }}>
                        {item.label}
                        {anySubSelected && <span style={{ fontSize: 11, fontWeight: 500, color: TEAL, marginLeft: 6 }}>({subCount} selected)</span>}
                      </span>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.5} style={{ marginLeft: 2, transition: 'transform .2s', transform: anySubSelected ? 'rotate(180deg)' : 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    {/* Sub-options — always visible when parent is checked, or on hover via open state */}
                    {anySubSelected && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', paddingLeft: 22, marginTop: 6, paddingBottom: 2 }}>
                        {item.sub.map((sub: string) => {
                          const active = selected.includes(sub)
                          return (
                            <label key={sub} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' as const }}>
                              <input type="checkbox" checked={active} onChange={() => toggleSvc(sub)}
                                style={{ width: 14, height: 14, accentColor: TEAL, cursor: 'pointer', flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? NAVY : '#475569', fontFamily: "'Aptos', sans-serif" }}>{sub}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    {/* Show sub-options always visible below parent even when unchecked — as expandable */}
                    {!anySubSelected && (
                      <details style={{ paddingLeft: 22, marginTop: 4 }}>
                        <summary style={{ fontSize: 11, color: TEAL, cursor: 'pointer', fontFamily: "'Aptos', sans-serif", fontWeight: 600, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Select authority <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </summary>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 6 }}>
                          {item.sub.map((sub: string) => {
                            const active = selected.includes(sub)
                            return (
                              <label key={sub} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' as const }}>
                                <input type="checkbox" checked={active} onChange={() => toggleSvc(sub)}
                                  style={{ width: 14, height: 14, accentColor: TEAL, cursor: 'pointer', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? NAVY : '#475569', fontFamily: "'Aptos', sans-serif" }}>{sub}</span>
                              </label>
                            )
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  } else if (fieldType === 'multiselect') {
    const selected: string[] = value
      ? (value.startsWith('[') ? (() => { try { return JSON.parse(value) } catch { return [] } })() : value.split(',').filter(Boolean))
      : []
    input = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#F8FAFC', minHeight: 48 }}>
        {(field.options ?? []).map((opt: string) => {
          const active = selected.includes(opt)
          return (
            <button key={opt} type="button"
              onClick={() => {
                const next = active ? selected.filter((s: string) => s !== opt) : [...selected, opt]
                onChange(key, JSON.stringify(next))
              }}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                fontFamily: "'Aptos', sans-serif", cursor: 'pointer', transition: 'all 0.15s',
                border: active ? `1.5px solid ${TEAL}` : '1.5px solid #CBD5E1',
                background: active ? TEAL : '#fff',
                color: active ? '#fff' : '#475569',
                boxShadow: active ? `0 1px 4px ${TEAL}30` : 'none',
                letterSpacing: '0.01em',
              }}>
              {active && <span style={{ marginRight: 4, fontSize: 10 }}>✓</span>}{opt}
            </button>
          )
        })}
      </div>
    )
  } else {
    input = (
      <input type="text" value={value} onChange={e => onChange(key, e.target.value)}
        placeholder={placeholder} className={inputCls}
        disabled={disabled}
        style={{ ...inputStyle, ...(disabled ? { background: '#F8FAFC', color: '#94A3B8', cursor: 'not-allowed' } : {}) }} />
    )
  }

  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', marginBottom: 4, fontFamily: "'Aptos', sans-serif" }}>
        {field.label}{isRequired && !disabled && <span style={{ color: '#ef4444' }}> *</span>}
        {disabled && <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: 6, textTransform: 'none', fontSize: 10 }}>(cannot be changed)</span>}
      </label>
      {input}
      {error && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error}</p>}
    </div>
  )
}

// ── Client Form Modal ─────────────────────────────────────────────────────────
interface ClientFormModalProps {
  mode: 'create' | 'edit'
  initial?: any
  fieldConfigs: Record<string, any>[]
  trainees: any[]
  representatives: any[]
  onClose: () => void
  onSuccess: () => void
}

function ClientFormModal({ mode, initial, fieldConfigs, trainees, representatives, onClose, onSuccess }: ClientFormModalProps) {
  const isEdit = mode === 'edit'
  const { user } = useAuth()
  // Billing contract is a Manager-and-above concern — hidden from Team Leads and Trainees
  const canManageBilling = ['ADMIN', 'PARTNER', 'MANAGER'].includes(user?.role ?? '')

  // Build initial form state from field configs
  const buildInitial = () => {
    const vals: Record<string, string> = {}
    fieldConfigs.forEach(f => {
      const key = f.fieldKey || f.field_key
      if (key === 'traineeId') { vals[key] = initial?.traineeId       ?? ''; return }
      if (NATIVE_KEYS.has(key)) {
        // date fields
        if (key === 'dateOfBirth' && initial?.[key]) {
          vals[key] = new Date(initial[key]).toISOString().split('T')[0]
        } else {
          vals[key] = initial?.[key] ?? ''
        }
        return
      }
      // extra field
      vals[key] = (initial?.extraFields as any)?.[key] ?? ''
    })
    return vals
  }

  const [form, setForm]         = useState<Record<string, string>>(() => ({
    ...buildInitial(),
  }))
  const [password,  setPassword]  = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [errors,    setErrors]    = useState<Record<string, string>>({})
  const [saving,    setSaving]    = useState(false)
  const [apiError,  setApiError]  = useState('')

  // Representative
  const [representativeId, setRepresentativeId] = useState<string>(initial?.representativeId ?? '')

  // Services
  const SALES_TAX_AUTHORITIES = ['FBR', 'PRA', 'SRB', 'KPRA', 'BRA', 'AJK']
  const [salesTaxAuthorities, setSalesTaxAuthorities] = useState<string[]>(initial?.salesTaxAuthorities ?? [])
  const [hasWhtService,       setHasWhtService]       = useState<boolean>(initial?.hasWhtService ?? false)
  const [hasAdvanceTaxService, setHasAdvanceTaxService] = useState<boolean>(initial?.hasAdvanceTaxService ?? false)
  const [yearEnd,             setYearEnd]             = useState<string>(initial?.yearEnd ?? 'JUNE')

  // Monthly retainership contract — Manager and above only
  const [hasMonthlyRetainer,  setHasMonthlyRetainer]  = useState<boolean>(initial?.hasMonthlyRetainer ?? false)
  const [retainerAmount,      setRetainerAmount]      = useState<string>(initial?.retainerAmount != null ? String(initial.retainerAmount) : '')
  const [retainerSalesTax,    setRetainerSalesTax]    = useState<boolean>(initial?.retainerSalesTax ?? false)
  const [retainerAuthorities, setRetainerAuthorities] = useState<string[]>(initial?.retainerSalesTaxAuthorities ?? [])
  const [retainerIncomeTax,   setRetainerIncomeTax]   = useState<boolean>(initial?.retainerIncomeTax ?? false)
  const [retainerWht,         setRetainerWht]         = useState<boolean>(initial?.retainerWht ?? false)

  const toggleAuthority = (auth: string) => {
    setSalesTaxAuthorities(prev =>
      prev.includes(auth) ? prev.filter(a => a !== auth) : [...prev, auth]
    )
  }

  const toggleRetainerAuthority = (auth: string) => {
    setRetainerAuthorities(prev =>
      prev.includes(auth) ? prev.filter(a => a !== auth) : [...prev, auth]
    )
  }

  // Portal access
  const [portalAccess,   setPortalAccess]   = useState<boolean>(initial?.user?.hasPortalAccess ?? false)
  // 'invite' | 'set_password' | null — null = not chosen yet (portal is OFF)
  const [portalMethod,   setPortalMethod]   = useState<'invite' | 'set_password' | null>(null)
  const [portalLoading,  setPortalLoading]  = useState(false)
  const [inviteSendingM, setInviteSendingM] = useState(false)
  const [portalMsg,      setPortalMsg]      = useState<{ text: string; ok: boolean } | null>(null)

  const handleTogglePortalModal = async () => {
    if (portalLoading) return
    if (!isEdit) {
      const next = !portalAccess
      setPortalAccess(next)
      setPortalMethod(next ? 'invite' : null)
      setPassword('')
      return
    }
    // Edit: call API immediately
    setPortalLoading(true)
    try {
      const { data: env } = await api.patch(`/clients/${initial.id}/toggle-portal`)
      const data = env?.data ?? env
      setPortalAccess(data.hasPortalAccess)
      if (!data.hasPortalAccess) setPortalMethod(null)
      else if (!portalMethod) setPortalMethod('invite')
      setPortalMsg({ text: `Portal access ${data.hasPortalAccess ? 'enabled' : 'disabled'}.`, ok: true })
      onSuccess()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to update portal access.'
      setPortalMsg({ text: Array.isArray(msg) ? msg.join(', ') : msg, ok: false })
    } finally {
      setPortalLoading(false)
      setTimeout(() => setPortalMsg(null), 5000)
    }
  }

  const handleSendInviteModal = async () => {
    if (!initial?.id || inviteSendingM) return
    setInviteSendingM(true)
    try {
      await api.post(`/clients/${initial.id}/send-invite`)
      setPortalMsg({ text: 'Invite sent successfully.', ok: true })
    } catch (err: any) {
      setPortalMsg({ text: err?.response?.data?.message ?? 'Failed to send invite.', ok: false })
    } finally {
      setInviteSendingM(false)
      setTimeout(() => setPortalMsg(null), 4000)
    }
  }

  const visibleFields = fieldConfigs.filter(f => f.isVisible ?? f.is_visible ?? true)

  const handleChange = (key: string, val: string) => {
    setForm(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n })
  }

  const validate = () => {
    const e: Record<string, string> = {}
    // Password required only when method is set_password
    if (portalMethod === 'set_password' && !password.trim()) e.password = 'Required'
    if (portalMethod === 'set_password' && password && password.length < 8) e.password = 'Minimum 8 characters'
    // Every client must be assigned to a staff member (manager, team lead, or trainee)
    if (!form.traineeId?.trim()) e.traineeId = 'Required'
    visibleFields.forEach(f => {
      const key = f.fieldKey || f.field_key
      if (f.isRequired ?? f.is_required) {
        if (!form[key]?.trim()) e[key] = 'Required'
      }
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    if (!validate()) return
    setSaving(true)

    try {
      const extraFields: Record<string, string> = {}
      const payload: Record<string, any> = {}

      visibleFields.forEach(f => {
        const key = f.fieldKey || f.field_key
        const val = form[key] ?? ''
        if (NATIVE_KEYS.has(key)) {
          payload[key] = val || undefined
        } else {
          if (val) extraFields[key] = val
        }
      })

      if (Object.keys(extraFields).length > 0) payload.extraFields = extraFields

      payload.salesTaxAuthorities = salesTaxAuthorities
      payload.hasWhtService       = hasWhtService
      payload.hasAdvanceTaxService = hasAdvanceTaxService
      payload.yearEnd             = yearEnd
      payload.representativeId    = representativeId || null

      // Billing contract — only Manager+ can see or change this, so never send it otherwise
      if (canManageBilling) {
        payload.hasMonthlyRetainer          = hasMonthlyRetainer
        payload.retainerAmount              = Number(retainerAmount) || 0
        payload.retainerSalesTax            = hasMonthlyRetainer && retainerSalesTax
        payload.retainerSalesTaxAuthorities = hasMonthlyRetainer && retainerSalesTax ? retainerAuthorities : []
        payload.retainerIncomeTax           = hasMonthlyRetainer && retainerIncomeTax
        payload.retainerWht                 = hasMonthlyRetainer && retainerWht
      }
      // Always send the assignment — it's mandatory and rendered outside the dynamic field loop above,
      // so it must not depend on that field's admin-configurable visibility toggle.
      payload.traineeId           = form.traineeId

      if (!isEdit) {
        payload.hasPortalAccess = portalAccess
        if (portalMethod === 'set_password') payload.password = password
        const { data: res } = await api.post('/clients', payload)
        // TransformInterceptor wraps every response as { success, data, timestamp },
        // so the created record is one level down. Reading it off the envelope left
        // profileId undefined and the invite was silently never sent.
        const created = res?.data ?? res
        // Auto-send invite if method is invite
        if (portalAccess && portalMethod === 'invite') {
          const profileId = created?.clientProfile?.id
          if (profileId) {
            await api.post(`/clients/${profileId}/send-invite`)
          }
        }
      } else {
        if (portalMethod === 'set_password' && password) payload.password = password
        await api.put(`/clients/${initial.id}`, payload)
        // Send invite if method chosen is invite in edit mode
        if (portalAccess && portalMethod === 'invite') await handleSendInviteModal()
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.message
      if (Array.isArray(msg)) setApiError(msg.join(', '))
      else setApiError(msg ?? 'Failed to save client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,46,87,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ padding: '10px 20px', borderBottom: `1px solid #CBD5E1`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#7EC8D0', borderRadius: '18px 18px 0 0' }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 14, fontWeight: 300, color: '#132E57', letterSpacing: '0.04em' }}>
              {isEdit ? `Edit Client` : 'New Client'}
            </h2>
            {isEdit && <p style={{ margin: '2px 0 0', fontSize: 13, color: '#132E57', fontFamily: "'Aptos', sans-serif", fontWeight: 600 }}>{initial?.businessName || initial?.user?.userCode}</p>}
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'rgba(19,46,87,0.12)', cursor: 'pointer', borderRadius: 8, width: 28, height: 28, fontSize: 16, color: '#132E57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {apiError && (
            <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 8, padding: '8px 14px', color: '#C62828', fontSize: 13, marginBottom: 16 }}>
              {apiError}
            </div>
          )}

          {/* Client ID — only shown in edit mode */}
          {isEdit && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif", flexShrink: 0 }}>
                Client ID
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F5F9', border: `1px solid ${P.border}`, borderRadius: 8, padding: '4px 12px' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: "'Aptos', sans-serif" }}>{initial?.user?.userCode ?? 'N/A'}</span>
              </div>
            </div>
          )}

          {/* Dynamic fields (excluding traineeId — rendered as section below) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
            {visibleFields.filter(f => (f.fieldKey || f.field_key) !== 'traineeId').map(field => {
              const key = field.fieldKey || field.field_key
              return (
                <DynamicField
                  key={key}
                  field={field}
                  value={form[key] ?? ''}
                  onChange={handleChange}
                  error={errors[key]}
                  trainees={trainees}
                  disabled={isEdit && key === 'email'}
                />
              )
            })}
          </div>

          {/* Assign Firm Representative */}
          <div style={{ marginTop: 16, borderRadius: 10, background: '#F8FAFC', border: `1px solid ${errors.traineeId ? '#ef4444' : P.border}` }}>
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${P.border}`, background: '#F1F5F9' }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif" }}>
                Assign Firm Representative <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <StyledSelect
                value={form['traineeId'] ?? ''}
                onChange={val => handleChange('traineeId', val)}
                placeholder="Select…"
                options={(trainees ?? []).map((t: any) => ({ value: t.id, label: t.fullName }))}
              />
              {errors.traineeId && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 5 }}>Every client must be assigned to a staff member</p>}
            </div>
          </div>

          {/* Fiscal Year End */}
          <div style={{ marginTop: 16, borderRadius: 10, background: '#F8FAFC', border: `1px solid ${P.border}` }}>
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${P.border}`, background: '#F1F5F9' }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif" }}>
                Fiscal Year End
              </span>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', fontFamily: "'Aptos', sans-serif", flex: 1 }}>
                Select the month in which this client's fiscal year ends
              </div>
              <div style={{ minWidth: 180 }}>
                <StyledSelect
                  value={yearEnd}
                  onChange={val => setYearEnd(val)}
                  options={[
                    { value: 'JANUARY', label: 'January' }, { value: 'FEBRUARY', label: 'February' },
                    { value: 'MARCH', label: 'March' }, { value: 'APRIL', label: 'April' },
                    { value: 'MAY', label: 'May' }, { value: 'JUNE', label: 'June' },
                    { value: 'JULY', label: 'July' }, { value: 'AUGUST', label: 'August' },
                    { value: 'SEPTEMBER', label: 'September' }, { value: 'OCTOBER', label: 'October' },
                    { value: 'NOVEMBER', label: 'November' }, { value: 'DECEMBER', label: 'December' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Assign Representative */}
          <div style={{ marginTop: 16, borderRadius: 10, background: '#F8FAFC', border: `1px solid ${P.border}` }}>
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${P.border}`, background: '#F1F5F9' }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif" }}>
                Assign Representative
              </span>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <StyledSelect
                value={representativeId}
                onChange={val => setRepresentativeId(val)}
                placeholder="None"
                options={[{ value: '', label: 'None' }, ...representatives.map((r: any) => ({ value: r.id, label: r.fullName }))]}
              />
            </div>
          </div>



          {/* Services section */}
          <div style={{ marginTop: 16, borderRadius: 10, background: '#F8FAFC', border: `1px solid ${P.border}` }}>
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${P.border}`, background: '#F1F5F9' }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif" }}>
                Services
              </span>
            </div>

            {/* Sales Tax */}
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, fontFamily: "'Aptos', sans-serif" }}>
                Sales Tax: Select Authorities
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {SALES_TAX_AUTHORITIES.map(auth => (
                  <label key={auth} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={salesTaxAuthorities.includes(auth)}
                      onChange={() => toggleAuthority(auth)}
                      style={{ accentColor: TEAL, width: 14, height: 14, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: salesTaxAuthorities.includes(auth) ? TEAL : '#64748B', fontFamily: "'Aptos', sans-serif" }}>
                      {auth}
                    </span>
                  </label>
                ))}
              </div>
              {salesTaxAuthorities.length === 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>
                  No authority selected. No Sales Tax tasks will be auto-created
                </p>
              )}
            </div>

            {/* WHT */}
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: "'Aptos', sans-serif", flex: 1 }}>
                Withholding Tax (WHT) FBR
              </div>
              <button
                type="button"
                onClick={() => setHasWhtService(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', padding: 0,
                  background: hasWhtService ? TEAL : '#CBD5E1',
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: hasWhtService ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left 0.2s', display: 'block',
                }} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: hasWhtService ? TEAL : '#94A3B8', fontFamily: "'Aptos', sans-serif", minWidth: 28 }}>
                {hasWhtService ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* Quarterly Advance Tax */}
            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: "'Aptos', sans-serif", flex: 1 }}>
                Quarterly Advance Tax
              </div>
              <button
                type="button"
                onClick={() => setHasAdvanceTaxService(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', padding: 0,
                  background: hasAdvanceTaxService ? TEAL : '#CBD5E1',
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: hasAdvanceTaxService ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left 0.2s', display: 'block',
                }} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: hasAdvanceTaxService ? TEAL : '#94A3B8', fontFamily: "'Aptos', sans-serif", minWidth: 28 }}>
                {hasAdvanceTaxService ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* Billing — Manager and above only */}
          {canManageBilling && (
            <div style={{ marginTop: 16, borderRadius: 10, background: '#F8FAFC', border: `1px solid ${P.border}` }}>
              <div style={{ padding: '10px 18px', borderBottom: `1px solid ${P.border}`, background: '#F1F5F9' }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif" }}>
                  Billing
                </span>
              </div>

              {/* Monthly retainer toggle */}
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: "'Aptos', sans-serif" }}>
                    Monthly Retainership
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: "'Aptos', sans-serif", marginTop: 2 }}>
                    Bill the selected services as one fixed monthly fee instead of per task
                  </div>
                </div>
                <button type="button" onClick={() => setHasMonthlyRetainer(v => !v)}
                  style={{ width: 44, height: 24, borderRadius: 12, border: 'none', padding: 0, background: hasMonthlyRetainer ? TEAL : '#CBD5E1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: hasMonthlyRetainer ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left 0.2s', display: 'block' }} />
                </button>
                <span style={{ fontSize: 12, fontWeight: 700, color: hasMonthlyRetainer ? TEAL : '#94A3B8', fontFamily: "'Aptos', sans-serif", minWidth: 28 }}>
                  {hasMonthlyRetainer ? 'ON' : 'OFF'}
                </span>
              </div>

              {hasMonthlyRetainer && (
                <>
                  {/* Monthly fee */}
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}` }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', marginBottom: 4, fontFamily: "'Aptos', sans-serif" }}>
                      Monthly Fee (PKR)
                    </label>
                    <input type="number" min={0} value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)}
                      placeholder="e.g. 25000" className={inputCls} style={inputStyle} />
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>
                      A draft invoice for this amount is created automatically on the 1st of each month
                    </p>
                  </div>

                  {/* Sales Tax in retainer */}
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: retainerSalesTax ? 8 : 0 }}>
                      <input type="checkbox" checked={retainerSalesTax} onChange={() => setRetainerSalesTax(v => !v)}
                        style={{ accentColor: TEAL, width: 14, height: 14, cursor: 'pointer' }} id="ret-st" />
                      <label htmlFor="ret-st" style={{ fontSize: 12, fontWeight: 700, color: retainerSalesTax ? TEAL : NAVY, fontFamily: "'Aptos', sans-serif", cursor: 'pointer' }}>
                        Sales Tax included
                      </label>
                    </div>
                    {retainerSalesTax && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', paddingLeft: 22 }}>
                        {SALES_TAX_AUTHORITIES.map(auth => (
                          <label key={auth} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input type="checkbox" checked={retainerAuthorities.includes(auth)} onChange={() => toggleRetainerAuthority(auth)}
                              style={{ accentColor: TEAL, width: 14, height: 14, cursor: 'pointer' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: retainerAuthorities.includes(auth) ? TEAL : '#64748B', fontFamily: "'Aptos', sans-serif" }}>
                              {auth}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Income Tax + WHT in retainer */}
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}`, display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={retainerIncomeTax} onChange={() => setRetainerIncomeTax(v => !v)}
                        style={{ accentColor: TEAL, width: 14, height: 14, cursor: 'pointer' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: retainerIncomeTax ? TEAL : NAVY, fontFamily: "'Aptos', sans-serif" }}>Income Tax included</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={retainerWht} onChange={() => setRetainerWht(v => !v)}
                        style={{ accentColor: TEAL, width: 14, height: 14, cursor: 'pointer' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: retainerWht ? TEAL : NAVY, fontFamily: "'Aptos', sans-serif" }}>WHT included</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${P.border}` }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 24px', borderRadius: 8, background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1, border: 'none', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Toggle-active confirm ─────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,46,87,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <p style={{ fontSize: 14, color: NAVY, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding: '8px 18px', borderRadius: 8, background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 2000,
      background: type === 'success' ? '#D1FAE5' : '#FEE2E2',
      color: type === 'success' ? '#065F46' : '#991B1B',
      border: `1px solid ${type === 'success' ? '#6EE7B7' : '#FECACA'}`,
      borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {message}
      <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, opacity: 0.6 }}>×</button>
    </div>
  )
}

// ── Rep Column Picker ─────────────────────────────────────────────────────────
const ALL_REP_COLS = [
  { key: 'name',    label: 'Name',    defaultWidth: 180 },
  { key: 'email',   label: 'Email',   defaultWidth: 200 },
  { key: 'phone',   label: 'Phone',   defaultWidth: 140 },
  { key: 'clients', label: 'Clients', defaultWidth: 180 },
  { key: 'status',  label: 'Status',  defaultWidth: 100 },
  { key: 'portal',  label: 'Portal',  defaultWidth: 90  },
]
const ALL_REP_COL_KEYS = ALL_REP_COLS.map(c => c.key)

function RepColumnPicker({ visible, onChange }: { visible: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const allSelected = visible.length === ALL_REP_COLS.length
  const toggle = (key: string) => {
    if (visible.includes(key) && visible.length === 1) return
    onChange(visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key])
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        background: open ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
        fontFamily: '"Aptos", sans-serif', letterSpacing: '0.06em',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3.75 9h16.5M3.75 15h16.5" />
        </svg>
        Columns {visible.length < ALL_REP_COLS.length && `(${visible.length}/${ALL_REP_COLS.length})`}
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50, background: '#0D1B2A', border: '1px solid #3F4753', borderRadius: 10, overflow: 'hidden', width: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #3F4753', background: 'rgba(30,132,150,0.15)' }}>
            <input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [ALL_REP_COL_KEYS[0]] : ALL_REP_COL_KEYS)} style={{ accentColor: TEAL, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FBDCB4', letterSpacing: '0.06em' }}>{allSelected ? 'Deselect All' : 'Select All'}</span>
          </label>
          {ALL_REP_COLS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)} style={{ accentColor: TEAL, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: visible.includes(col.key) ? '#FBDCB4' : '#9FA7B2' }}>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Client Representatives Section ───────────────────────────────────────────
function RepresentativesSection({ canCreate, canEdit, canDelete, showNewRep, setShowNewRep }: { canCreate: boolean; canEdit: boolean; canDelete: boolean; showNewRep: boolean; setShowNewRep: (v: boolean) => void }) {
  const [reps, setReps]             = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [editRep, setEditRep]       = useState<any | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [toast, setToast]           = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [visibleCols, setVisibleCols] = useState<string[]>(ALL_REP_COL_KEYS)
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    Object.fromEntries(ALL_REP_COLS.map(c => [c.key, c.defaultWidth])),
  )
  const [colsHydrated, setColsHydrated] = useState(false)
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null)

  useEffect(() => {
    const saved = lsGet<string[]>(LS_REP_COLS, ALL_REP_COL_KEYS)
    const valid = saved.filter(k => ALL_REP_COL_KEYS.includes(k))
    setVisibleCols(valid.length > 0 ? valid : ALL_REP_COL_KEYS)
    const defaults = Object.fromEntries(ALL_REP_COLS.map(c => [c.key, c.defaultWidth]))
    setColWidths({ ...defaults, ...lsGet<Record<string, number>>(LS_REP_WIDTHS, {}) })
    setColsHydrated(true)
  }, [])

  useEffect(() => { if (colsHydrated) lsSet(LS_REP_COLS, visibleCols) }, [visibleCols, colsHydrated])
  useEffect(() => { if (colsHydrated) lsSet(LS_REP_WIDTHS, colWidths) }, [colWidths, colsHydrated])

  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = { key, startX: e.clientX, startW: colWidths[key] }
    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return
      setColWidths(prev => ({ ...prev, [resizingCol.current!.key]: Math.max(50, resizingCol.current!.startW + ev.clientX - resizingCol.current!.startX) }))
    }
    const onUp = () => { resizingCol.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [colWidths])

  const fetchReps = () => {
    setLoading(true)
    api.get('/client-representatives')
      .then(({ data }) => setReps(Array.isArray(data) ? data : data?.data ?? []))
      .catch(() => setToast({ message: 'Failed to load representatives.', type: 'error' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReps() }, [])

  const filtered = reps.filter(r => {
    if (statusFilter === 'active')   return r.isActive !== false
    if (statusFilter === 'inactive') return r.isActive === false
    return true
  }).filter(r =>
    !search || r.fullName?.toLowerCase().includes(search.toLowerCase()) || r.email?.toLowerCase().includes(search.toLowerCase())
  )

  const handleToggleActive = async (r: any) => {
    try {
      await api.patch(`/client-representatives/${r.id}/toggle-active`)
      setReps(prev => prev.map(x => x.id === r.id ? { ...x, isActive: !x.isActive } : x))
      setToast({ message: `${r.fullName} ${r.isActive ? 'deactivated' : 'activated'}.`, type: 'success' })
    } catch { setToast({ message: 'Failed to update status.', type: 'error' }) }
  }

  const handleDeleteRep = async () => {
    const r = confirmDelete
    if (!r) return
    setConfirmDelete(null)
    try {
      await api.delete(`/client-representatives/${r.id}`)
      setReps(prev => prev.filter(x => x.id !== r.id))
      setToast({ message: `${r.fullName} deleted permanently.`, type: 'success' })
    } catch (err: any) {
      // The API refuses while clients are still assigned and says which ones,
      // so surface that rather than a generic failure.
      const msg = err?.response?.data?.message
      setToast({ message: Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to delete representative.', type: 'error' })
    }
  }

  const handleToggleRepPortal = async (r: any) => {
    try {
      const { data: env } = await api.patch(`/client-representatives/${r.id}/toggle-portal`)
      const data = env?.data ?? env
      setReps(prev => prev.map(x => x.id === r.id ? { ...x, hasPortalAccess: data.hasPortalAccess } : x))
      setToast({ message: `Portal access ${data.hasPortalAccess ? 'enabled' : 'disabled'} for ${r.fullName}.`, type: 'success' })
    } catch { setToast({ message: 'Failed to update portal access.', type: 'error' }) }
  }

  const visibleRepCols = ALL_REP_COLS.filter(c => visibleCols.includes(c.key))

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          message={`Permanently delete "${confirmDelete.fullName}"? This removes the record from the database and cannot be undone.`}
          onConfirm={handleDeleteRep}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {(showNewRep || editRep) && (
        <RepFormModal
          initial={editRep}
          onClose={() => { setShowNewRep(false); setEditRep(null) }}
          onSuccess={() => { fetchReps(); setShowNewRep(false); setEditRep(null) }}
        />
      )}

      {/* Filter bar — identical to Clients */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px' }}>

          {/* Status pills */}
          {[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'All', value: 'all' }].map(({ label, value }) => (
            <button key={value} onClick={() => setStatusFilter(value as any)} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', transition: 'all .15s', whiteSpace: 'nowrap',
              background: statusFilter === value ? NAVY : 'transparent',
              color: statusFilter === value ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>{label}</button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 220 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: '"Aptos", sans-serif' }} />
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Column Picker */}
          <RepColumnPicker visible={visibleCols} onChange={setVisibleCols} />

          {/* Count */}
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', paddingLeft: 4, paddingRight: 4 }}>
            {filtered.length} representatives
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            {visibleRepCols.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              {visibleRepCols.map((col) => (
                <th key={col.key} style={{ padding: '6px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.07em', whiteSpace: 'nowrap', position: 'relative', userSelect: 'none', overflow: 'hidden' }}>
                  {col.label}
                  <span onMouseDown={e => onResizeStart(col.key, e)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                    <span style={{ width: 2, height: '55%', background: 'rgba(0,0,0,0.2)', borderRadius: 2 }} />
                  </span>
                </th>
              ))}
              <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.07em', whiteSpace: 'nowrap' }} />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  {Array.from({ length: visibleRepCols.length + 1 }).map((__, c) => (
                    <td key={c} style={{ padding: '6px 14px', borderBottom: `1px solid ${P.border}50` }}>
                      <div style={{ height: 12, borderRadius: 4, background: P.gridLine }} />
                    </td>
                  ))}
                </tr>
              ))
              : filtered.length === 0
                ? <tr><td colSpan={visibleRepCols.length + 1} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted }}>{search ? `No representatives matching "${search}".` : 'No representatives yet. Click New Representative to add one.'}</td></tr>
                : filtered.map((r, idx) => {
                  const td: React.CSSProperties = { padding: '6px 14px', borderBottom: `1px solid ${P.border}50`, fontFamily: "'Aptos', sans-serif", fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                  const na = <span style={{ color: '#CBD5E1' }}>N/A</span>
                  const cellMap: Record<string, React.ReactNode> = {
                    name:    <td key="name"    style={{ ...td, fontWeight: 600, color: P.textHeading }}>{r.fullName}</td>,
                    email:   <td key="email"   style={{ ...td, color: P.textMuted }}>{r.email}</td>,
                    phone:   <td key="phone"   style={{ ...td, color: P.textMuted }}>{r.phone || na}</td>,
                    clients: (
                      <td key="clients" style={{ ...td, color: P.textMuted, whiteSpace: 'normal', lineHeight: '1.6' }}>
                        {(r.clients && r.clients.length > 0)
                          ? r.clients.map((c: any, i: number) => (
                            <div key={c.id} style={{ fontSize: 12 }}>
                              <span style={{ color: '#94A3B8', fontWeight: 600, marginRight: 4 }}>{i + 1}.</span>
                              {c.businessName || c.user?.fullName || c.user?.userCode || 'Unknown'}
                            </div>
                          ))
                          : <span style={{ color: '#CBD5E1' }}>None</span>
                        }
                      </td>
                    ),
                    status:  (
                      <td key="status" style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: r.isActive !== false ? '#E8F5E9' : '#FFEBEE', color: r.isActive !== false ? '#2E7D32' : '#C62828' }}>
                          {r.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    ),
                    portal: (
                      <td key="portal" style={td}>
                        <button onClick={() => handleToggleRepPortal(r)} title="Toggle portal access"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                            background: r.hasPortalAccess ? '#E6F4F6' : '#F1F5F9',
                            color: r.hasPortalAccess ? TEAL : '#94A3B8',
                          }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.hasPortalAccess ? TEAL : '#CBD5E1', display: 'inline-block' }} />
                          {r.hasPortalAccess ? 'ON' : 'OFF'}
                        </button>
                      </td>
                    ),
                  }
                  return (
                    <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC', opacity: r.isActive === false ? 0.55 : 1 }}>
                      {visibleRepCols.map(col => cellMap[col.key])}
                      <td style={{ padding: '6px 14px', borderBottom: `1px solid ${P.border}50`, textAlign: 'right' }}>
                        {(canCreate || canEdit || canDelete) && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {canEdit && (
                              <button onClick={() => setEditRep(r)} title="Edit"
                                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
                                </svg>
                              </button>
                            )}
                            <button onClick={() => handleToggleActive(r)} title={r.isActive !== false ? 'Deactivate' : 'Activate'}
                              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.isActive !== false ? '#EF4444' : '#22C55E' }}
                              onMouseEnter={e => { e.currentTarget.style.background = r.isActive !== false ? '#FEF2F2' : '#F0FDF4' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                              {r.isActive !== false
                                ? <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                              }
                            </button>
                            {canDelete && (
                              <button onClick={() => setConfirmDelete(r)} title="Delete permanently"
                                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B91C1C' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Representative Form Modal ─────────────────────────────────────────────────
function RepFormModal({ initial, onClose, onSuccess }: { initial?: any; onClose: () => void; onSuccess: () => void }) {
  const isEdit = !!initial
  const [form, setForm]               = useState({ fullName: initial?.fullName ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '' })
  // 'admin' = we set password, 'invite' = send email link, null = portal OFF
  const [portalAccess, setPortalAccess] = useState<boolean>(initial?.hasPortalAccess ?? false)
  const [pwdMode, setPwdMode]         = useState<'admin' | 'invite' | null>(initial?.hasPortalAccess ? 'admin' : null)
  const [password, setPassword]       = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg]     = useState('')
  const [errors, setErrors]           = useState<Record<string, string>>({})
  const [saving, setSaving]           = useState(false)
  const [apiError, setApiError]       = useState('')

  const handleChange = (key: string, val: string) => {
    setForm(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n })
  }

  const togglePortalLocal = () => {
    const next = !portalAccess
    setPortalAccess(next)
    if (!next) { setPwdMode(null); setPassword('') }
    else if (pwdMode === null) setPwdMode('admin')
  }

  // Edit mode: toggle portal immediately via API
  const handleTogglePortal = async () => {
    if (!isEdit) { togglePortalLocal(); return }
    const enabling = !portalAccess
    if (enabling && pwdMode === 'admin' && !password.trim()) {
      setErrors(p => ({ ...p, password: 'Password is required' })); return
    }
    setPortalLoading(true)
    try {
      const body = enabling ? (pwdMode === 'admin' ? { password } : {}) : {}
      const { data: env } = await api.patch(`/client-representatives/${initial.id}/toggle-portal`, body)
      const data = env?.data ?? env
      setPortalAccess(data.hasPortalAccess)
      if (!data.hasPortalAccess) { setPwdMode(null); setPassword('') }
      if (data.inviteSent) setInviteMsg('Portal enabled, invite email sent.')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setApiError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to toggle portal')
    } finally { setPortalLoading(false) }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.fullName.trim()) e.fullName = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    if (!isEdit && portalAccess && pwdMode === 'admin' && !password.trim()) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/client-representatives/${initial.id}`, { fullName: form.fullName, email: form.email, phone: form.phone || undefined })
      } else {
        const res = await api.post('/client-representatives', { fullName: form.fullName, email: form.email, phone: form.phone || undefined })
        // Responses come back wrapped by TransformInterceptor as { success, data, timestamp },
        // so the record itself is one level down.
        const createdRep = res.data?.data ?? res.data
        if (portalAccess) {
          await api.patch(`/client-representatives/${createdRep.id}/toggle-portal`, pwdMode === 'admin' ? { password } : {})
        }
      }
      onSuccess()
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setApiError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const fields = [
    { key: 'fullName', label: 'Full Name', placeholder: 'Representative full name', required: true },
    { key: 'email',    label: 'Email',     placeholder: 'email@example.com',        required: true },
    { key: 'phone',    label: 'Phone',     placeholder: '+92 3XX XXXXXXX',          required: false },
  ]

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', marginBottom: 4, fontFamily: "'Aptos', sans-serif" }
  const optBtn = (active: boolean) => ({
    flex: 1, padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${active ? TEAL : '#CBD5E1'}`,
    background: active ? '#F0FAFA' : '#fff', color: active ? TEAL : '#64748B',
    fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: "'Aptos', sans-serif",
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,46,87,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#7EC8D0', borderRadius: '18px 18px 0 0', position: 'sticky', top: 0, zIndex: 1 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 14, fontWeight: 300, color: '#132E57', letterSpacing: '0.04em' }}>
              {isEdit ? 'Edit Representative' : 'New Representative'}
            </h2>
            {isEdit && <p style={{ margin: '2px 0 0', fontSize: 13, color: '#132E57', fontFamily: "'Aptos', sans-serif", fontWeight: 600 }}>{initial.fullName}</p>}
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'rgba(19,46,87,0.12)', cursor: 'pointer', borderRadius: 8, width: 28, height: 28, fontSize: 16, color: '#132E57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {apiError && <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 8, padding: '8px 14px', color: '#C62828', fontSize: 13, marginBottom: 16 }}>{apiError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {fields.map(f => (
              <div key={f.key} style={{ gridColumn: f.key === 'phone' ? 'span 1' : 'span 2' }}>
                <label style={labelStyle}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
                <input type="text" value={(form as any)[f.key]} onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder} className={inputCls}
                  style={{ ...inputStyle, borderColor: errors[f.key] ? '#ef4444' : '#CBD5E1' }} />
                {errors[f.key] && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{errors[f.key]}</p>}
              </div>
            ))}
          </div>

          {/* Portal Access toggle */}
          <div style={{ marginTop: 16, borderRadius: 10, background: '#F8FAFC', border: `1px solid ${P.border}` }}>
            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: "'Aptos', sans-serif", flex: 1 }}>
                Portal Access
              </div>
              <button type="button" onClick={isEdit ? handleTogglePortal : togglePortalLocal} disabled={portalLoading}
                style={{ width: 48, height: 26, borderRadius: 13, border: 'none', padding: 0, background: portalAccess ? TEAL : '#CBD5E1', cursor: portalLoading ? 'default' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: portalLoading ? 0.6 : 1, flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: portalAccess ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left 0.2s', display: 'block' }} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: portalAccess ? TEAL : '#94A3B8', fontFamily: "'Aptos', sans-serif", minWidth: 28 }}>
                {portalLoading ? '…' : portalAccess ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* Step 2: password mode selection — shown when portal is ON */}
            {portalAccess && (!isEdit || !initial?.hasPortalAccess) && (
              <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${P.border}` }}>
                <p style={{ margin: '12px 0 8px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Aptos', sans-serif" }}>
                  How should the password be set?
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: pwdMode === 'admin' ? 12 : 0 }}>
                  <button type="button" onClick={() => { setPwdMode('admin'); setErrors(p => { const n={...p}; delete n.password; return n }) }} style={optBtn(pwdMode === 'admin')}>
                    I will set the password
                  </button>
                  <button type="button" onClick={() => { setPwdMode('invite'); setPassword(''); setErrors(p => { const n={...p}; delete n.password; return n }) }} style={optBtn(pwdMode === 'invite')}>
                    Send invite email
                  </button>
                </div>

                {pwdMode === 'admin' && (
                  <div>
                    <label style={labelStyle}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErrors(p => { const n={...p}; delete n.password; return n }) }}
                      placeholder="Set portal login password" className={inputCls}
                      style={{ ...inputStyle, borderColor: errors.password ? '#ef4444' : '#CBD5E1' }} />
                    {errors.password && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{errors.password}</p>}
                  </div>
                )}
                {pwdMode === 'invite' && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748B', fontFamily: "'Aptos', sans-serif" }}>
                    An invite email will be sent to <strong>{form.email || 'the representative'}</strong> with a link to set their own password.
                  </p>
                )}
              </div>
            )}

            {/* Resend invite — edit mode, portal already ON */}
            {isEdit && portalAccess && initial?.hasPortalAccess && (
              <div style={{ padding: '0 18px 14px', borderTop: `1px solid ${P.border}` }}>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" disabled={inviteLoading} onClick={async () => {
                    setInviteLoading(true); setInviteMsg('')
                    try {
                      await api.post(`/client-representatives/${initial.id}/send-invite`)
                      setInviteMsg('Invite email sent successfully!')
                    } catch (err: any) {
                      setInviteMsg(err?.response?.data?.message ?? 'Failed to send invite')
                    } finally { setInviteLoading(false) }
                  }} style={{ fontSize: 12, fontWeight: 700, color: TEAL, background: 'none', border: `1px solid ${TEAL}`, borderRadius: 6, padding: '5px 12px', cursor: inviteLoading ? 'not-allowed' : 'pointer', opacity: inviteLoading ? 0.6 : 1, fontFamily: "'Aptos', sans-serif" }}>
                    {inviteLoading ? 'Sending…' : 'Resend Invite Email'}
                  </button>
                  {inviteMsg && <span style={{ fontSize: 12, color: inviteMsg.includes('success') ? TEAL : '#ef4444' }}>{inviteMsg}</span>}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${P.border}` }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1, border: 'none', fontFamily: "'Aptos', sans-serif" }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Representative'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientsListPage() {
  const { user }           = useAuth()
  const canCreateClient    = usePermission('clients_create')
  const canEditClient      = usePermission('clients_edit')
  const canViewReps        = usePermission('representatives')
  const canCreateRep       = usePermission('representatives_create')
  const canEditRep         = usePermission('representatives_edit')
  // Permanent delete is irreversible, so it matches the API guard: Admin/Partner only.
  const canDelete          = user?.role === 'ADMIN' || user?.role === 'PARTNER'
  // Legacy canAdd for staff fetching (manager+ can always see trainee list for assignment)
  const canAdd             = user?.role === 'ADMIN' || user?.role === 'PARTNER' || canCreateClient || canEditClient

  const [activeTab,    setActiveTab]    = useState<'clients' | 'representatives'>('clients')
  const [clients,         setClients]         = useState<any[]>([])
  const [trainees,        setTrainees]        = useState<any[]>([])
  const [representatives, setRepresentatives] = useState<any[]>([])
  const [fieldConfigs,    setFieldConfigs]    = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [searchInput,  setSearchInput]  = useState('')

  const [showCreate,     setShowCreate]     = useState(false)
  const [showNewRep,     setShowNewRep]     = useState(false)
  const [editClient,     setEditClient]     = useState<any | null>(null)
  const [confirmToggle,  setConfirmToggle]  = useState<any | null>(null)
  const [confirmDelete,  setConfirmDelete]  = useState<any | null>(null)
  const [inviteSending,  setInviteSending]  = useState<string | null>(null)
  const [toast,          setToast]          = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [statusFilter,   setStatusFilter]   = useState<'all' | 'active' | 'inactive'>('all')
  const [visibleCols, setVisibleCols] = useState<string[]>(ALL_CLIENT_COL_KEYS)
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    Object.fromEntries(ALL_CLIENT_COLS.map(c => [c.key, c.defaultWidth])),
  )
  const [colsHydrated, setColsHydrated] = useState(false)
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null)

  useEffect(() => {
    const saved = lsGet<string[]>(LS_CLIENT_COLS, ALL_CLIENT_COL_KEYS)
    const valid = saved.filter(k => ALL_CLIENT_COL_KEYS.includes(k))
    setVisibleCols(valid.length > 0 ? valid : ALL_CLIENT_COL_KEYS)
    const defaults = Object.fromEntries(ALL_CLIENT_COLS.map(c => [c.key, c.defaultWidth]))
    setColWidths({ ...defaults, ...lsGet<Record<string, number>>(LS_CLIENT_WIDTHS, {}) })
    setColsHydrated(true)
  }, [])

  useEffect(() => { if (colsHydrated) lsSet(LS_CLIENT_COLS, visibleCols) }, [visibleCols, colsHydrated])
  useEffect(() => { if (colsHydrated) lsSet(LS_CLIENT_WIDTHS, colWidths) }, [colWidths, colsHydrated])

  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = { key, startX: e.clientX, startW: colWidths[key] }
    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return
      const delta = ev.clientX - resizingCol.current.startX
      const newW  = Math.max(50, resizingCol.current.startW + delta)
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

  const fetchClients = (srch?: string, silent = false) => {
    if (!silent) setLoading(true)
    api.get('/clients', { params: srch ? { search: srch } : {} })
      .then(({ data }) => setClients(data.data ?? data ?? []))
      .catch(() => { if (!silent) setToast({ message: 'Failed to load clients.', type: 'error' }) })
      .finally(() => { if (!silent) setLoading(false) })
  }

  useAutoRefresh(() => fetchClients(search || undefined, true))

  useEffect(() => {
    fetchClients()

    // Load form field configs
    api.get('/crm/form-fields/public', { params: { form_type: 'client' } })
      .then(({ data }) => setFieldConfigs(data.data ?? data ?? []))
      .catch(() => {})

    // Load staff (managers, team leads, trainees) for assignment
    if (canAdd) {
      const fetchRole = (role: string) =>
        api.get('/users', { params: { role } }).then(({ data }) => data.data ?? []).catch(() => [])
      Promise.all([fetchRole('MANAGER'), fetchRole('TEAM_LEAD'), fetchRole('TRAINEE')])
        .then(([managers, teamLeads, trainees]) => {
          setTrainees([...managers, ...teamLeads, ...trainees])
        })
      api.get('/client-representatives')
        .then(({ data }) => setRepresentatives(Array.isArray(data) ? data : data?.data ?? []))
        .catch(() => {})
    }
  }, [canAdd]) // eslint-disable-line

  const visibleConfigs = useMemo(
    () => fieldConfigs.filter(f => f.isVisible ?? f.is_visible ?? true),
    [fieldConfigs]
  )

  const handleTogglePortal = async (c: any) => {
    try {
      const { data: env } = await api.patch(`/clients/${c.id}/toggle-portal`)
      const data = env?.data ?? env
      setClients(prev => prev.map(cl =>
        cl.id === c.id ? { ...cl, user: { ...cl.user, hasPortalAccess: data.hasPortalAccess } } : cl
      ))
      setToast({ message: `Portal access ${data.hasPortalAccess ? 'enabled' : 'disabled'} for ${c.businessName || c.user?.userCode}.`, type: 'success' })
    } catch {
      setToast({ message: 'Failed to update portal access.', type: 'error' })
    }
  }

  const handleSendInvite = async (c: any) => {
    setInviteSending(c.id)
    try {
      await api.post(`/clients/${c.id}/send-invite`)
      setToast({ message: `Invite sent successfully.`, type: 'success' })
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message ?? 'Failed to send invite.', type: 'error' })
    } finally {
      setInviteSending(null)
    }
  }

  const handleDeleteClient = async () => {
    const c = confirmDelete
    if (!c) return
    setConfirmDelete(null)
    try {
      await api.delete(`/clients/${c.id}`)
      setClients(prev => prev.filter(x => x.id !== c.id))
      setToast({ message: `${c.businessName || c.user?.fullName || 'Client'} deleted permanently.`, type: 'success' })
    } catch (err: any) {
      // The API refuses when tasks, cases, invoices or payments exist and names
      // the counts, so show that message rather than a generic failure.
      const msg = err?.response?.data?.message
      setToast({ message: Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to delete client.', type: 'error' })
    }
  }

  const handleToggleActive = async () => {
    const c = confirmToggle
    setConfirmToggle(null)
    try {
      await api.patch(`/clients/${c.id}/toggle-active`)
      setClients(prev => prev.map(cl =>
        cl.id === c.id ? { ...cl, user: { ...cl.user, isActive: !cl.user.isActive } } : cl
      ))
      setToast({ message: `${c.businessName || c.user?.userCode} ${c.user?.isActive ? 'deactivated' : 'activated'}.`, type: 'success' })
    } catch {
      setToast({ message: 'Failed to update client status.', type: 'error' })
    }
  }

  return (
    <div style={{ padding: '0 20px 20px', minHeight: '100vh', background: P.bgMain }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showCreate && (
        <ClientFormModal
          mode="create"
          fieldConfigs={visibleConfigs}
          trainees={trainees}
          representatives={representatives}
          onClose={() => setShowCreate(false)}
          onSuccess={() => fetchClients(search || undefined)}
        />
      )}
      {editClient && (
        <ClientFormModal
          mode="edit"
          initial={editClient}
          fieldConfigs={visibleConfigs}
          trainees={trainees}
          representatives={representatives}
          onClose={() => setEditClient(null)}
          onSuccess={() => fetchClients(search || undefined)}
        />
      )}
      {confirmToggle && (
        <ConfirmDialog
          message={`${confirmToggle.user?.isActive ? 'Deactivate' : 'Activate'} client "${confirmToggle.businessName || confirmToggle.user?.userCode}"?`}
          onConfirm={handleToggleActive}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Permanently delete client "${confirmDelete.businessName || confirmDelete.user?.userCode}"? This removes the record and its portal login from the database and cannot be undone. It is refused if the client has any tasks, cases, invoices or payments.`}
          onConfirm={handleDeleteClient}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52, marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 22, color: P.navy, margin: 0, display: 'inline-block', transform: 'skewX(12deg)' }}>
          {activeTab === 'clients' ? 'Clients' : 'Client Representatives'}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Tab Pills — same style as Dashboard period pills */}
          <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
            {([
              { key: 'clients', label: 'Clients', show: true },
              { key: 'representatives', label: 'Representatives', show: canViewReps },
            ] as const).filter(tab => tab.show).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{
                background: activeTab === tab.key ? NAVY : 'transparent',
                color: activeTab === tab.key ? '#fff' : '#64748B',
                border: 'none', padding: '6px 14px', borderRadius: 6,
                fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
                fontFamily: '"Aptos", sans-serif', letterSpacing: '0.03em',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}>{tab.label}</button>
            ))}
          </div>
        {canViewReps && canCreateRep && activeTab === 'representatives' && (
          <button onClick={() => setShowNewRep(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em',
              boxShadow: '0 2px 8px rgba(30,132,150,0.25)',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Representative
          </button>
        )}
        {canCreateClient && activeTab === 'clients' && (
          <button onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em',
              boxShadow: '0 2px 8px rgba(30,132,150,0.25)',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Client
          </button>
        )}
        </div>
      </div>

      {/* Representatives Tab */}
      {activeTab === 'representatives' && canViewReps && <RepresentativesSection canCreate={canCreateRep} canEdit={canEditRep} canDelete={canDelete} showNewRep={showNewRep} setShowNewRep={setShowNewRep} />}

      {/* Clients Tab */}
      {activeTab === 'clients' && <>

      {/* Filter Bar */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px' }}>

          {/* Status pills */}
          {[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'All', value: 'all' }].map(({ label, value }) => (
            <button key={value} onClick={() => setStatusFilter(value as any)} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Aptos", sans-serif', transition: 'all .15s', whiteSpace: 'nowrap',
              background: statusFilter === value ? NAVY : 'transparent',
              color: statusFilter === value ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>
              {label}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 220 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search…" value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setSearch(e.target.value); fetchClients(e.target.value || undefined) }}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: '"Aptos", sans-serif' }} />
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          {/* Column Picker */}
          <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />

          {/* Count */}
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', paddingLeft: 4, paddingRight: 4 }}>
            {clients.filter(c => {
              if (statusFilter === 'active')   return c.user?.isActive !== false
              if (statusFilter === 'inactive') return c.user?.isActive === false
              return true
            }).length} clients
          </span>

        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            {ALL_CLIENT_COLS.filter(c => visibleCols.includes(c.key)).map(c => (
              <col key={c.key} style={{ width: colWidths[c.key] }} />
            ))}
            {/* Actions column */}
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              {ALL_CLIENT_COLS.filter(c => visibleCols.includes(c.key)).map((col, i, arr) => (
                <th key={col.key} style={{
                  padding: '6px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                  textTransform: 'uppercase', color: '#1a1a1a',
                  fontFamily: "'Aptos', sans-serif", letterSpacing: '0.07em', whiteSpace: 'nowrap',
                  position: 'relative', userSelect: 'none', overflow: 'hidden',
                }}>
                  {col.label}
                  <span onMouseDown={e => onResizeStart(col.key, e)} style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                    cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                  }}>
                    <span style={{ width: 2, height: '55%', background: 'rgba(0,0,0,0.2)', borderRadius: 2 }} />
                  </span>
                </th>
              ))}
              <th style={{
                padding: '6px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600,
                textTransform: 'uppercase', color: '#1a1a1a',
                fontFamily: "'Aptos', sans-serif", letterSpacing: '0.07em', whiteSpace: 'nowrap',
              }} />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  {Array.from({ length: visibleCols.length + 1 }).map((__, c) => (
                    <td key={c} style={{ padding: '6px 14px', borderBottom: `1px solid ${P.border}50` }}>
                      <div style={{ height: 12, borderRadius: 4, background: P.gridLine }} />
                    </td>
                  ))}
                </tr>
              ))
              : clients.length === 0
                ? (
                  <tr>
                    <td colSpan={visibleCols.length + 1} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted }}>
                      {search ? `No clients matching "${search}".` : 'No clients yet. Click + New Client to add one.'}
                    </td>
                  </tr>
                )
                : clients.filter(c => {
                    if (statusFilter === 'active')   return c.user?.isActive !== false
                    if (statusFilter === 'inactive') return c.user?.isActive === false
                    return true
                  }).map((c, idx) => {
                  const td: React.CSSProperties = {
                    padding: '6px 14px', borderBottom: `1px solid ${P.border}50`,
                    fontFamily: "'Aptos', sans-serif", fontSize: 13, whiteSpace: 'nowrap',
                  }
                  const na = <span style={{ color: '#CBD5E1' }}>N/A</span>

                  const cellMap: Record<string, React.ReactNode> = {
                    business:       <td key="business"       style={{ ...td, fontWeight: 700, color: P.teal }}>{c.businessName ?? na}</td>,
                    ntn:            <td key="ntn"            style={{ ...td, color: P.textMuted }}>{c.ntn ?? na}</td>,
                    strn:           <td key="strn"           style={{ ...td, color: P.textMuted }}>{c.strn ?? na}</td>,
                    yearEnd:        <td key="yearEnd"        style={{ ...td, color: P.textMuted }}>{c.yearEnd ? c.yearEnd.charAt(0) + c.yearEnd.slice(1).toLowerCase() : na}</td>,
                    trainee:        <td key="trainee"        style={{ ...td, color: P.textMuted }}>{c.trainee?.fullName ?? na}</td>,
                    representative: <td key="representative" style={{ ...td, color: P.textMuted }}>{c.representative?.fullName ?? na}</td>,
                    status:   (
                      <td key="status" style={td}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                          borderRadius: 9999, fontSize: 11, fontWeight: 600,
                          background: c.user?.isActive !== false ? '#E8F5E9' : '#FFEBEE',
                          color: c.user?.isActive !== false ? '#2E7D32' : '#C62828',
                        }}>
                          {c.user?.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    ),
                  }

                  return (
                  <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC', opacity: c.user?.isActive === false ? 0.55 : 1 }}>
                    {ALL_CLIENT_COLS.filter(col => visibleCols.includes(col.key)).map(col => cellMap[col.key])}
                    <td style={{ padding: '6px 14px', borderBottom: `1px solid ${P.border}50` }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {canEditClient && (
                          <>
                            {c.user?.hasPortalAccess && (
                              <button onClick={() => handleSendInvite(c)}
                                disabled={inviteSending === c.id}
                                title="Send portal invite"
                                style={{
                                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${TEAL}`, background: inviteSending === c.id ? '#E6F4F6' : '#fff',
                                  color: TEAL, cursor: inviteSending === c.id ? 'default' : 'pointer',
                                  whiteSpace: 'nowrap',
                                }}>
                                {inviteSending === c.id ? 'Sending…' : 'Send Invite'}
                              </button>
                            )}
                            <button onClick={() => setEditClient(c)} title="Edit"
                              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                            <button onClick={() => setConfirmToggle(c)} title={c.user?.isActive !== false ? 'Deactivate' : 'Activate'}
                              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.user?.isActive !== false ? '#EF4444' : '#22C55E' }}
                              onMouseEnter={e => { e.currentTarget.style.background = c.user?.isActive !== false ? '#FEF2F2' : '#F0FDF4' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                              {c.user?.isActive !== false
                                ? <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                              }
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button onClick={() => setConfirmDelete(c)} title="Delete permanently"
                            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B91C1C' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
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
      </> }
    </div>
  )
}
