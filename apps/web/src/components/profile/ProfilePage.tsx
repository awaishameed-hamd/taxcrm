'use client'

import { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import StyledSelect from '@/components/ui/StyledSelect'

// Core fields live on the User model (not in extraFields)
const PROFILE_CORE_KEYS = new Set([
  'fullName', 'firstName', 'midName', 'lastName',
  'email', 'phone', 'dateOfBirth',
  'dateOfJoining', 'department',
  'cnic', 'permanentAddress', 'currentAddress',
  'bank', 'accountTitle', 'bankAccountNo', 'ibanNo',
])

// Always read-only for users — manager/admin-managed fields
const PROFILE_READONLY_KEYS = new Set([
  'dateOfJoining', 'department', 'articlesType', 'employmentType',
])

const COL_SPAN_MAP: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }

const NAVY = '#132E57'
const TEAL = '#1E8496'

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
  // days = remaining days in the current month (from tomorrow to month-end)
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const days   = daysInMonth - today.getDate()
  // months = full months from next month's 1st to end's month
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const months = (end.getFullYear() - nextMonthStart.getFullYear()) * 12 + (end.getMonth() - nextMonthStart.getMonth())
  const years  = Math.floor(months / 12)
  const remMon = months % 12
  const parts  = []
  if (years  > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`)
  if (remMon > 0) parts.push(`${remMon} month${remMon !== 1 ? 's' : ''}`)
  if (days   > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : 'Articles ending today'
}

function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5)  return d
  if (d.length <= 12) return d.slice(0, 5) + '-' + d.slice(5)
  return d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12)
}

function fmtPKR(val: unknown) {
  if (!val || Number(val) === 0) return null
  return 'PKR ' + Number(val).toLocaleString('en-PK', { minimumFractionDigits: 0 })
}

const inputCls    = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'
const inputErrCls = 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
const textareaCls = inputCls + ' resize-none'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {children}
    </label>
  )
}

function FieldWrapper({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm" style={{ overflow: 'visible' }}>
      <div className="px-5 py-2.5 border-b border-gray-200" style={{ background: 'linear-gradient(90deg, #E4E9F0, #EDF0F5)', borderRadius: '12px 12px 0 0' }}>
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#64748B' }}>{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  )
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold"
      style={{
        background: type === 'success' ? '#D1FAE5' : '#FEE2E2',
        color: type === 'success' ? '#065F46' : '#991B1B',
        border: `1px solid ${type === 'success' ? '#6EE7B7' : '#FECACA'}`,
      }}>
      {message}
      <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
    </div>
  )
}

interface FieldConfig {
  fieldKey: string; label: string; placeholder?: string; isRequired?: boolean
  fieldType: string; options?: string[]; colSpan?: string; textareaRows?: number; section?: string
}

function DynamicField({ field, value, onChange, disabled, error }: {
  field: FieldConfig; value: string; onChange: (key: string, val: string) => void
  disabled: boolean; error?: string
}) {
  const span = COL_SPAN_MAP[field.colSpan ?? 'third'] ?? 2
  const iCls = `${inputCls} ${error ? inputErrCls : ''}`
  const onCh = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange(field.fieldKey, e.target.value)

  let input: React.ReactNode
  switch (field.fieldType) {
    case 'date':
      input = <input type="date" value={value} onChange={onCh} disabled={disabled} className={iCls} />
      break
    case 'number':
      input = <input type="number" value={value} onChange={onCh} disabled={disabled} placeholder={field.placeholder ?? ''} className={iCls} />
      break
    case 'textarea':
      input = <textarea value={value} onChange={onCh} disabled={disabled} placeholder={field.placeholder ?? ''} rows={field.textareaRows || 3} className={textareaCls} />
      break
    case 'select':
      input = (
        <StyledSelect
          value={value}
          onChange={v => onChange(field.fieldKey, v)}
          placeholder="Select…"
          disabled={disabled}
          options={[{ value: '', label: 'Select…' }, ...(field.options ?? []).map((o: string) => ({ value: o, label: o }))]}
        />
      )
      break
    case 'amount_pkr':
      input = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">₨</span>
          <input type="number" value={value} onChange={onCh} disabled={disabled} placeholder={field.placeholder ?? '0.00'} className={`${iCls} pl-7`} />
        </div>
      )
      break
    default:
      if (field.fieldKey === 'cnic') {
        input = <input type="text" value={value}
          onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))}
          disabled={disabled} placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={iCls} />
      } else {
        input = <input type="text" value={value} onChange={onCh} disabled={disabled} placeholder={field.placeholder ?? ''} className={iCls} />
      }
  }

  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <FieldWrapper label={field.label} required={field.isRequired} error={error}>{input}</FieldWrapper>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { updateUser } = useAuth()
  const [profile, setProfile]           = useState<Record<string, any> | null>(null)
  const [editing, setEditing]           = useState(false)
  const [form, setForm]                 = useState<Record<string, any>>({})
  const [extraFields, setExtraFields]   = useState<Record<string, string>>({})
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([])
  const [pwForm, setPwForm]             = useState({ current_password: '', new_password: '', new_password_confirmation: '' })
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [pwErrors, setPwErrors]         = useState<Record<string, string>>({})
  const [loading, setLoading]           = useState(false)
  const [pwLoading, setPwLoading]       = useState(false)
  const [toast, setToast]               = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    api.get('/auth/me').then(res => {
      const d = res.data?.data ?? res.data
      setProfile(d)
      setForm({ ...d, dateOfBirth: toDateStr(d.dateOfBirth), dateOfJoining: toDateStr(d.dateOfJoining) })
      setExtraFields(d.extraFields ?? {})
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/crm/form-fields/public', { params: { form_type: 'user' } })
      .then(res => {
        const fields: FieldConfig[] = res.data?.data ?? res.data ?? []
        setFieldConfigs(fields.map(f =>
          f.fieldKey === 'dateOfJoining' ? { ...f, label: 'CA Articles Start Date' } : f
        ))
      })
      .catch(() => {})
  }, [])

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

  const handleFieldChange = (key: string, val: string) => {
    if (PROFILE_CORE_KEYS.has(key)) setForm(p => ({ ...p, [key]: val }))
    else setExtraFields(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => ({ ...p, [key]: '' }))
  }

  const setPw = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPwForm(p => ({ ...p, [name]: value }))
    if (pwErrors[name]) setPwErrors(p => ({ ...p, [name]: '' }))
  }

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true); setErrors({})
    try {
      const ALLOWED = [
        'fullName','firstName','midName','lastName',
        'email','phone','dateOfBirth','dateOfJoining',
        'department','experience',
        'cnic','permanentAddress','currentAddress',
        'bank','accountTitle','bankAccountNo','ibanNo',
      ]
      const payload: Record<string, any> = {}
      ALLOWED.forEach(k => {
        const v = form[k]
        if (k === 'dateOfBirth' || k === 'dateOfJoining') {
          if (v) payload[k] = v
        } else {
          payload[k] = v ?? ''
        }
      })
      if (Object.keys(extraFields).length > 0) payload.extraFields = extraFields
      const res = await api.put('/profile', payload)
      const updated = res.data?.data?.user ?? res.data?.user ?? res.data?.data ?? res.data
      setProfile(updated)
      setForm({ ...updated, dateOfBirth: toDateStr(updated.dateOfBirth), dateOfJoining: toDateStr(updated.dateOfJoining) })
      setExtraFields(updated.extraFields ?? {})
      setEditing(false)
      if (updated.fullName) updateUser({ fullName: updated.fullName })
      setToast({ message: 'Profile updated successfully.', type: 'success' })
    } catch (err: any) {
      if (err.response?.status === 422) {
        const raw = err.response.data?.errors ?? {}
        const flat: Record<string, string> = {}
        Object.entries(raw).forEach(([k, v]) => { flat[k] = Array.isArray(v) ? v[0] as string : String(v) })
        setErrors(flat)
        setToast({ message: 'Please fix the highlighted errors.', type: 'error' })
      } else {
        setToast({ message: err.response?.data?.message ?? 'Update failed.', type: 'error' })
      }
    } finally { setLoading(false) }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!pwForm.current_password) errs.current_password = 'Current password is required.'
    if (!pwForm.new_password) errs.new_password = 'New password is required.'
    else if (pwForm.new_password.length < 8) errs.new_password = 'Password must be at least 8 characters.'
    if (pwForm.new_password !== pwForm.new_password_confirmation) errs.new_password_confirmation = 'Passwords do not match.'
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return }

    setPwLoading(true); setPwErrors({})
    try {
      await api.put('/profile/password', { current_password: pwForm.current_password, new_password: pwForm.new_password })
      setPwForm({ current_password: '', new_password: '', new_password_confirmation: '' })
      setToast({ message: 'Password changed successfully.', type: 'success' })
    } catch (err: any) {
      const status = err.response?.status
      if (status === 400 || status === 422) {
        const msgs: string[] = Array.isArray(err.response?.data?.message)
          ? err.response.data.message
          : [err.response?.data?.message ?? '']
        const mapped: Record<string, string> = {}
        msgs.forEach((m: string) => {
          if (m.includes('new_password')) mapped.new_password = m
          else if (m.includes('current_password')) mapped.current_password = m
          else mapped.current_password = m
        })
        setPwErrors(mapped)
        setToast({ message: Object.values(mapped)[0], type: 'error' })
      } else {
        const msg = err.response?.data?.message ?? 'Current password is incorrect.'
        setPwErrors({ current_password: msg })
        setToast({ message: msg, type: 'error' })
      }
    } finally { setPwLoading(false) }
  }

  const err   = (key: string) => errors[key] ?? ''
  const pwErr = (key: string) => pwErrors[key] ?? ''

  const locked   = !!profile?.profileLocked
  const disabled = !editing || locked

  const getValue = (key: string) =>
    PROFILE_CORE_KEYS.has(key) ? String(form[key] ?? '') : String(extraFields[key] ?? '')

  const cancelEditing = () => {
    setEditing(false)
    if (profile) {
      setForm({ ...profile, dateOfBirth: toDateStr(profile.dateOfBirth), dateOfJoining: toDateStr(profile.dateOfJoining) })
      setExtraFields(profile.extraFields ?? {})
    }
    setErrors({})
  }

  const salaryTotal = ['basicSalary', 'punctualityAllowance', 'travellingAllowance', 'otherAllowance']
    .reduce((s, k) => s + (parseFloat(String(profile?.[k] ?? 0)) || 0), 0)

  const renderSection = (sectionName: string) => {
    const sectionFields = grouped[sectionName] ?? []
    if (sectionFields.length === 0) return null

    if (sectionName === 'Salary (PKR)') {
      return (
        <SectionCard key={sectionName} title={sectionName}>
          {salaryTotal === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Salary details not set. Contact HR.</p>
          ) : (
            <div className="flex items-center divide-x divide-gray-200 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
              {sectionFields.map(field => (
                <div key={field.fieldKey} className="flex-1 px-4 py-3 text-center">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{field.label}</p>
                  <p className="text-sm font-bold"
                    style={{ color: profile?.[field.fieldKey] && Number(profile[field.fieldKey]) > 0 ? '#AA7F56' : '#9CA3AF' }}>
                    {fmtPKR(profile?.[field.fieldKey]) ?? 'N/A'}
                  </p>
                </div>
              ))}
              <div className="flex-1 px-4 py-3 text-center" style={{ background: 'rgba(170,127,86,0.06)' }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Total</p>
                <p className="text-sm font-bold" style={{ color: '#AA7F56' }}>
                  PKR {salaryTotal.toLocaleString('en-PK', { minimumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      )
    }

    const empType   = extraFields['employmentType'] ?? String(form['employmentType'] ?? '')
    const isCaTrainee = empType === 'CA Trainee'

    const remaining = sectionName === 'Personal Information' && isCaTrainee
      ? calcRemainingArticles(
          getValue('dateOfJoining'),
          extraFields['articlesType'] ?? String(form['articlesType'] ?? ''),
        )
      : ''

    const CA_TRAINEE_ONLY = new Set(['articlesType', 'dateOfJoining'])
    const visibleFields = sectionName === 'Personal Information'
      ? sectionFields.filter(f => isCaTrainee || !CA_TRAINEE_ONLY.has(f.fieldKey))
      : sectionFields

    return (
      <SectionCard key={sectionName} title={sectionName}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {visibleFields.map(field => (
            <DynamicField key={field.fieldKey} field={field} value={getValue(field.fieldKey)}
              onChange={handleFieldChange}
              disabled={disabled || PROFILE_READONLY_KEYS.has(field.fieldKey)}
              error={err(field.fieldKey)} />
          ))}
          {/* Computed: Remaining Articles Time — only for CA Trainees */}
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

  if (!profile) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3 mb-4" />
            <div className="space-y-3">
              {[1, 2].map(j => <div key={j} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
            My Profile
          </h1>
        </div>

        {locked ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Profile Locked
          </div>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={cancelEditing}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ border: '1px solid #5C6D82', color: '#9FA7B2', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FBDCB4'; e.currentTarget.style.borderColor = '#AA7F56' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9FA7B2'; e.currentTarget.style.borderColor = '#5C6D82' }}>
              Cancel
            </button>
            <button type="button" onClick={() => handleSave()} disabled={loading}
              className="px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`, color: '#fff', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, #2296AA 0%, #1E8496 100%)' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)` }}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
            className="px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`, color: '#fff', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}
            onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg, #2296AA 0%, #1E8496 100%)'}
            onMouseLeave={e => e.currentTarget.style.background = `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`}>
            Edit Profile
          </button>
        )}
      </div>

      {/* Account (always read-only) */}
      <SectionCard title="Account">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FieldWrapper label="User Code">
            <input value={profile.userCode ?? ''} disabled className={inputCls} readOnly />
          </FieldWrapper>
          <FieldWrapper label="Role">
            <input value={profile.role ?? ''} disabled className={inputCls} readOnly />
          </FieldWrapper>
          <FieldWrapper label="Status">
            <input value={profile.isActive ? 'Active' : 'Inactive'} disabled className={inputCls} readOnly />
          </FieldWrapper>
        </div>
      </SectionCard>

      {/* Dynamic sections from form field configs */}
      <form id="profile-form" onSubmit={handleSave} className="space-y-5">
        {sectionOrder.map(sectionName => renderSection(sectionName))}
      </form>

      {/* Change Password */}
      <SectionCard title="Change Password">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FieldWrapper label="Current Password" error={pwErr('current_password')}>
              <input name="current_password" type="password" value={pwForm.current_password} onChange={setPw}
                placeholder="Current password"
                className={`${inputCls} ${pwErr('current_password') ? inputErrCls : ''}`} />
            </FieldWrapper>
            <FieldWrapper label="New Password" error={pwErr('new_password')}>
              <input name="new_password" type="password" value={pwForm.new_password} onChange={setPw}
                placeholder="Min 8 characters"
                className={`${inputCls} ${pwErr('new_password') ? inputErrCls : ''}`} />
            </FieldWrapper>
            <FieldWrapper label="Confirm New Password" error={pwErr('new_password_confirmation')}>
              <input name="new_password_confirmation" type="password" value={pwForm.new_password_confirmation} onChange={setPw}
                placeholder="Repeat new password"
                className={`${inputCls} ${pwErr('new_password_confirmation') ? inputErrCls : ''}`} />
            </FieldWrapper>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={pwLoading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`, color: '#fff', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}
              onMouseEnter={e => { if (!pwLoading) e.currentTarget.style.background = 'linear-gradient(135deg, #2296AA 0%, #1E8496 100%)' }}
              onMouseLeave={e => { if (!pwLoading) e.currentTarget.style.background = `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)` }}>
              {pwLoading ? 'Updating…' : 'Change Password'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}

