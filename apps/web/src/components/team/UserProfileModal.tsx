'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import StyledSelect from '@/components/ui/StyledSelect'

// ── Constants ─────────────────────────────────────────────────────────────────
const PROFILE_CORE_KEYS = new Set([
  'fullName', 'firstName', 'midName', 'lastName',
  'email', 'phone', 'dateOfBirth', 'dateOfJoining',
  'department', 'experience', 'cnic',
  'permanentAddress', 'currentAddress',
  'basicSalary', 'punctualityAllowance', 'travellingAllowance', 'otherAllowance',
  'bank', 'accountTitle', 'bankAccountNo', 'ibanNo',
])

const COL_SPAN_MAP: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }

interface FieldConfig {
  fieldKey: string; label: string; placeholder?: string; isRequired?: boolean
  fieldType: string; options?: string[]; colSpan?: string; textareaRows?: number; section?: string
}

// ── Shared input styles ────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'

function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5)  return d
  if (d.length <= 12) return d.slice(0, 5) + '-' + d.slice(5)
  return d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12)
}

function toDateStr(v: unknown) { return v ? String(v).slice(0, 10) : '' }

function calcRemainingArticles(dateOfJoining: string, articlesType: string): string {
  if (!dateOfJoining || !articlesType) return ''
  const match = articlesType.match(/(\d+(?:\.\d+)?)/)
  if (!match) return ''
  const totalYears = parseFloat(match[1])
  const start = new Date(dateOfJoining)
  const end   = new Date(start)
  end.setFullYear(end.getFullYear() + Math.floor(totalYears))
  end.setMonth(end.getMonth() + Math.round((totalYears % 1) * 12))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (today >= end) return 'Articles completed'
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const days        = daysInMonth - today.getDate()
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const months = (end.getFullYear() - nextMonthStart.getFullYear()) * 12 + (end.getMonth() - nextMonthStart.getMonth())
  const years  = Math.floor(months / 12)
  const remMon = months % 12
  const parts: string[] = []
  if (years  > 0) parts.push(`${years} year${years  !== 1 ? 's' : ''}`)
  if (remMon > 0) parts.push(`${remMon} month${remMon !== 1 ? 's' : ''}`)
  if (days   > 0) parts.push(`${days} day${days   !== 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : 'Articles ending today'
}

// ── Dynamic field (same logic as ProfilePage) ─────────────────────────────────
function DynamicField({ field, value, onChange, error }: {
  field: FieldConfig; value: string
  onChange: (key: string, val: string) => void; error?: string
}) {
  const span = COL_SPAN_MAP[field.colSpan ?? 'third'] ?? 2
  const iCls = `${inputCls} ${error ? 'border-red-400' : ''}`
  const onCh = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange(field.fieldKey, e.target.value)

  let input: React.ReactNode
  switch (field.fieldType) {
    case 'date':
      input = <input type="date" value={value} onChange={onCh} className={iCls} />
      break
    case 'number':
      input = <input type="number" value={value} onChange={onCh} placeholder={field.placeholder ?? ''} className={iCls} />
      break
    case 'textarea':
      input = <textarea value={value} onChange={onCh} placeholder={field.placeholder ?? ''} rows={field.textareaRows || 3} className={`${iCls} resize-none`} />
      break
    case 'select':
      input = (
        <StyledSelect
          value={value}
          onChange={v => onChange(field.fieldKey, v)}
          placeholder="Select…"
          options={[{ value: '', label: 'Select…' }, ...(field.options ?? []).map((o: string) => ({ value: o, label: o }))]}
        />
      )
      break
    case 'amount_pkr':
      input = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">₨</span>
          <input type="number" value={value} onChange={onCh} placeholder={field.placeholder ?? '0.00'} className={`${iCls} pl-7`} />
        </div>
      )
      break
    default:
      if (field.fieldKey === 'cnic') {
        input = <input type="text" value={value}
          onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))}
          placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={iCls} />
      } else {
        const typeAttr = field.fieldKey === 'email' ? 'email' : field.fieldKey === 'phone' ? 'tel' : 'text'
        input = <input type={typeAttr} value={value} onChange={onCh} placeholder={field.placeholder ?? ''} className={iCls} />
      }
  }

  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
        {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {input}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm" style={{ overflow: 'visible' }}>
      <div className="px-5 py-2.5 border-b border-gray-200" style={{ background: 'linear-gradient(90deg, #E4E9F0, #EDF0F5)', borderRadius: '12px 12px 0 0' }}>
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: P.textMuted }}>{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface UserProfileModalProps {
  userId?: string           // if provided → edit mode
  creatableRoles: string[]  // only used in create mode
  onClose:    () => void
  onSuccess:  () => void
}

// ── Main Modal ────────────────────────────────────────────────────────────────
const ROLE_HIERARCHY = ['ADMIN', 'PARTNER', 'MANAGER', 'TEAM_LEAD', 'TRAINEE']
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', PARTNER: 'Partner', MANAGER: 'Manager', TEAM_LEAD: 'Team Lead', TRAINEE: 'Trainee',
}

export default function UserProfileModal({ userId, creatableRoles, onClose, onSuccess }: UserProfileModalProps) {
  const isEdit = !!userId
  const { user: authUser } = useAuth()
  const myRoleIdx      = ROLE_HIERARCHY.indexOf(authUser?.role ?? '')
  const assignableRoles = myRoleIdx >= 0 ? ROLE_HIERARCHY.slice(myRoleIdx + 1) : []

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm]               = useState<Record<string, any>>({
    role: creatableRoles[0] ?? '', password: '',
  })
  const [extraFields, setExtraFields] = useState<Record<string, string>>({})
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([])
  const [nextCode, setNextCode]       = useState<string | null>(null)
  const [codeLoad, setCodeLoad]       = useState(false)
  const [dataLoad, setDataLoad]       = useState(isEdit)
  const [saving, setSaving]           = useState(false)
  const [errors, setErrors]           = useState<Record<string, string>>({})
  const [apiError, setApiError]       = useState('')
  const [teamLeads, setTeamLeads]     = useState<{ id: string; fullName: string; userCode: string }[]>([])
  const [teamLeadId, setTeamLeadId]   = useState<string>('')

  // ── Load team leads (for TRAINEE role assignment) ─────────────────────────
  useEffect(() => {
    api.get('/users', { params: { role: 'TEAM_LEAD' } })
      .then(r => { const d = r.data?.data ?? r.data ?? []; setTeamLeads(Array.isArray(d) ? d : []) })
      .catch(() => {})
  }, [])

  // ── Load field configs ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/crm/form-fields/public', { params: { form_type: 'user' } })
      .then(res => setFieldConfigs(res.data?.data ?? res.data ?? []))
      .catch(() => {})
  }, [])

  // ── Load user data (edit mode) ────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    setDataLoad(true)
    api.get(`/users/${userId}`)
      .then(res => {
        const d = res.data?.data ?? res.data
        setForm({
          ...d,
          dateOfBirth:   toDateStr(d.dateOfBirth),
          dateOfJoining: toDateStr(d.dateOfJoining),
          password: '',
        })
        setExtraFields(d.extraFields ?? {})
        if (d.teamLeadId) setTeamLeadId(d.teamLeadId)
      })
      .catch(() => setApiError('Failed to load user data.'))
      .finally(() => setDataLoad(false))
  }, [isEdit, userId])

  // ── Fetch next code (create mode, role change) ────────────────────────────
  const fetchCode = useCallback(async (role: string) => {
    if (!role || isEdit) return
    setCodeLoad(true)
    try {
      const { data } = await api.get('/users/next-code', { params: { role } })
      setNextCode(typeof data === 'string' ? data : data?.data ?? null)
    } catch { setNextCode(null) }
    finally { setCodeLoad(false) }
  }, [isEdit])

  useEffect(() => {
    if (!isEdit && form.role) fetchCode(form.role)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Section grouping ──────────────────────────────────────────────────────
  const { sectionOrder, grouped } = useMemo(() => {
    const order: string[] = []
    const map: Record<string, FieldConfig[]> = {}
    fieldConfigs.forEach(f => {
      const s = f.section || 'General'
      if (!order.includes(s)) order.push(s)
      if (!map[s]) map[s] = []
      map[s].push(f)
    })
    return { sectionOrder: order, grouped: map }
  }, [fieldConfigs])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleFieldChange(key: string, val: string) {
    if (PROFILE_CORE_KEYS.has(key)) setForm(p => ({ ...p, [key]: val }))
    else setExtraFields(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n })
  }

  function handleRoleChange(role: string) {
    setForm(p => ({ ...p, role }))
    fetchCode(role)
  }

  function getValue(key: string) {
    return PROFILE_CORE_KEYS.has(key) ? String(form[key] ?? '') : String(extraFields[key] ?? '')
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErrors({}); setApiError('')

    try {
      if (isEdit) {
        const ALLOWED = [
          'fullName', 'firstName', 'midName', 'lastName',
          'email', 'phone',
          'dateOfBirth', 'dateOfJoining', 'department', 'experience',
          'cnic', 'permanentAddress', 'currentAddress',
          'bank', 'accountTitle', 'bankAccountNo', 'ibanNo',
          'basicSalary', 'punctualityAllowance', 'travellingAllowance', 'otherAllowance',
        ]
        const payload: Record<string, any> = {}
        ALLOWED.forEach(k => {
          const v = form[k]
          if (k === 'dateOfBirth' || k === 'dateOfJoining') {
            if (v) payload[k] = v
          } else {
            payload[k] = v ?? null
          }
        })
        if (form.role) payload.role = form.role
        if (form.password) payload.password = form.password
        if (Object.keys(extraFields).length > 0) payload.extraFields = extraFields
        if (form.role === 'TRAINEE') payload.teamLeadId = teamLeadId || null
        await api.put(`/users/${userId}`, payload)
      } else {
        if (form.role === 'TRAINEE' && !teamLeadId) {
          setApiError('Please assign a Team Lead for this trainee.')
          setSaving(false)
          return
        }
        const payload: any = {
          email:      form.email,
          phone:      form.phone || null,
          password:   form.password,
          role:       form.role,
          teamLeadId: form.role === 'TRAINEE' ? teamLeadId : null,
        }
        // Also send profile fields if filled
        const PROFILE_FIELDS = [
          'firstName', 'midName', 'lastName', 'dateOfBirth', 'dateOfJoining',
          'department', 'experience', 'cnic', 'permanentAddress', 'currentAddress',
          'bank', 'accountTitle', 'bankAccountNo', 'ibanNo',
          'basicSalary', 'punctualityAllowance', 'travellingAllowance', 'otherAllowance',
        ]
        PROFILE_FIELDS.forEach(k => { if (form[k]) payload[k] = form[k] })
        if (Object.keys(extraFields).length > 0) payload.extraFields = extraFields
        await api.post('/users', payload)
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.message
      if (Array.isArray(msg)) setApiError(msg.join(', '))
      else setApiError(msg ?? 'An error occurred.')
    } finally { setSaving(false) }
  }

  // ── Render section ────────────────────────────────────────────────────────
  function renderSection(sectionName: string) {
    const fields = grouped[sectionName] ?? []
    if (fields.length === 0) return null

    const empType     = extraFields['employmentType'] ?? String(form['employmentType'] ?? '')
    const isCaTrainee = empType === 'CA Trainee'
    const CA_TRAINEE_ONLY = new Set(['articlesType', 'dateOfJoining'])
    const remaining   = sectionName === 'Personal Information' && isCaTrainee
      ? calcRemainingArticles(String(form.dateOfJoining ?? ''), extraFields['articlesType'] ?? '')
      : ''

    const visibleFields = sectionName === 'Personal Information'
      ? fields.filter(f => isCaTrainee || !CA_TRAINEE_ONLY.has(f.fieldKey))
      : fields

    return (
      <SectionCard key={sectionName} title={sectionName}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {visibleFields.map(field => (
            <DynamicField
              key={field.fieldKey}
              field={field}
              value={getValue(field.fieldKey)}
              onChange={handleFieldChange}
              error={errors[field.fieldKey]}
            />
          ))}
          {sectionName === 'Personal Information' && isCaTrainee && (
            <div style={{ gridColumn: 'span 2' }}>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Remaining Articles Time
              </label>
              <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
                style={{ fontSize: 13, lineHeight: '1.4', wordBreak: 'break-word' }}>
                {remaining || <span className="text-gray-400">Set CA Articles Start Date &amp; Articles Type</span>}
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    )
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const iStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid #D1D5DB`, fontSize: 13, outline: 'none',
    color: P.textHeading, fontFamily: '"Aptos", sans-serif', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: P.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(19,46,87,0.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '24px 16px', overflowY: 'auto',
    }}>
      <div style={{
        background: '#F8FAFC', borderRadius: 18, width: '100%', maxWidth: 780,
        boxShadow: '0 32px 80px rgba(0,0,0,0.3)', marginBottom: 24,
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 28px', borderBottom: `1px solid ${P.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #DDE3EC 0%, #D0D8E4 100%)',
          borderRadius: '18px 18px 0 0',
        }}>
          <h2 style={{ margin: 0, fontFamily: '"Aptos", sans-serif', fontSize: 18, fontWeight: 900, color: P.navy, letterSpacing: '0.04em' }}>
            {isEdit ? `Edit ${form.fullName || 'User'}` : 'Create New User'}
          </h2>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 24, color: P.textMuted, lineHeight: 1 }}>×</button>
        </div>

        {dataLoad ? (
          <div style={{ padding: 60, textAlign: 'center', color: P.textMuted, fontSize: 14 }}>Loading…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* API error */}
              {apiError && (
                <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 10, padding: '10px 14px', color: '#C62828', fontSize: 13 }}>
                  {apiError}
                </div>
              )}

              {/* ── Account Section ── */}
              <SectionCard title="Account">
                {isEdit ? (
                  <>
                    {/* Edit: User Code read-only, Role editable dropdown */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label style={labelStyle}>User Code</label>
                        <div style={{ ...iStyle, background: '#F8FAFC', color: P.teal, fontWeight: 700, fontFamily: '"Aptos", sans-serif', letterSpacing: '0.06em' }}>
                          {form.userCode ?? ''}
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Role</label>
                        {assignableRoles.length > 0 ? (
                          <StyledSelect
                            value={form.role ?? ''}
                            onChange={val => setForm(p => ({ ...p, role: val }))}
                            options={assignableRoles.map(r => ({ value: r, label: ROLE_LABELS[r] ?? r }))}
                          />
                        ) : (
                          <div style={{ ...iStyle, background: '#F8FAFC', color: P.textHeading, fontWeight: 600 }}>
                            {ROLE_LABELS[form.role] ?? form.role ?? ''}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Edit: Team Lead assignment for TRAINEE */}
                    {form.role === 'TRAINEE' && (
                      <div style={{ marginTop: 12 }}>
                        <label style={labelStyle}>Team Lead</label>
                        <StyledSelect
                          value={teamLeadId}
                          onChange={val => setTeamLeadId(val)}
                          placeholder="Select Team Lead"
                          options={teamLeads.map(tl => ({ value: tl.id, label: tl.fullName }))}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  /* Create: role selector + auto code + required fields */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label style={labelStyle}>Role *</label>
                        <StyledSelect
                          value={form.role}
                          onChange={val => handleRoleChange(val)}
                          options={creatableRoles.map(r => ({ value: r, label: r === 'TEAM_LEAD' ? 'Team Lead' : r.charAt(0) + r.slice(1).toLowerCase() }))}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>User Code (Auto)</label>
                        <div style={{ ...iStyle, background: '#F8FAFC', color: P.teal, fontWeight: 700, fontFamily: '"Aptos", sans-serif', letterSpacing: '0.06em' }}>
                          {codeLoad ? 'Loading…' : (nextCode ?? '')}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label style={labelStyle}>Email *</label>
                        <input style={iStyle} type="email" required value={form.email ?? ''}
                          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                          placeholder="name@cafirm.com" />
                      </div>
                      <div>
                        <label style={labelStyle}>Password *</label>
                        <input style={iStyle} type="text" required minLength={8} value={form.password ?? ''}
                          onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                          placeholder="Min 8 characters" />
                      </div>
                    </div>

                    {/* Team Lead assignment, required for TRAINEE */}
                    {form.role === 'TRAINEE' && (
                      <div>
                        <label style={labelStyle}>Team Lead <span style={{ color: '#D62828' }}>*</span></label>
                        <StyledSelect
                          value={teamLeadId}
                          onChange={val => setTeamLeadId(val)}
                          placeholder="Select Team Lead"
                          options={teamLeads.map(tl => ({ value: tl.id, label: tl.fullName }))}
                        />
                        {teamLeads.length === 0 && (
                          <p style={{ fontSize: 11, color: '#DC2626', marginTop: 4, fontFamily: '"Aptos", sans-serif' }}>
                            No Team Leads found. Create a Team Lead first.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* ── Dynamic sections (same as ProfilePage) ── */}
              {sectionOrder.map(sectionName => renderSection(sectionName))}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 28px', borderTop: `1px solid ${P.border}`,
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: '#fff', borderRadius: '0 0 18px 18px',
            }}>
              <button type="button" onClick={onClose} style={{
                padding: '9px 20px', borderRadius: 8, border: `1px solid ${P.border}`,
                background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{
                padding: '9px 24px', borderRadius: 8, border: 0,
                background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                fontFamily: '"Aptos", sans-serif', letterSpacing: '0.04em',
              }}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
