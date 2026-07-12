'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import StyledSelect from '@/components/ui/StyledSelect'

const NAVY  = '#132E57'
const TEAL  = '#1E8496'
const WHITE = '#FFFFFF'

const FIELD_TYPES = [
  { value: 'text',       label: 'Text' },
  { value: 'number',     label: 'Number' },
  { value: 'select',     label: 'Select' },
  { value: 'date',       label: 'Date' },
  { value: 'textarea',   label: 'Textarea' },
  { value: 'amount_pkr', label: 'Amount (PKR)' },
]

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  text:       { bg: '#EFF6FF', color: '#1D4ED8' },
  number:     { bg: '#FEF9C3', color: '#854D0E' },
  select:     { bg: '#F0FDF4', color: '#166534' },
  date:       { bg: '#FDF4FF', color: '#7E22CE' },
  textarea:   { bg: '#FFF7ED', color: '#9A3412' },
  amount_pkr: { bg: '#FFF7ED', color: '#92400E' },
}

const TYPE_LABELS: Record<string, string> = {
  text: 'Text', number: 'Number', select: 'Select', date: 'Date',
  textarea: 'Textarea', amount_pkr: 'PKR ₨',
}

const WIDTH_OPTS = [
  { value: 'full',       label: '100%', span: 6 },
  { value: 'two_thirds', label: '2/3',  span: 4 },
  { value: 'half',       label: '1/2',  span: 3 },
  { value: 'third',      label: '1/3',  span: 2 },
]

const NO_PLACEHOLDER = ['select', 'date', 'amount_pkr']

// ── Atoms ─────────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const tc = TYPE_COLORS[type] ?? TYPE_COLORS.text
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap"
      style={{ background: tc.bg, color: tc.color }}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

function CoreBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
      style={{ background: 'rgba(30,132,150,0.12)', color: TEAL, border: `1px solid ${TEAL}` }}>
      Core
    </span>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: checked ? TEAL : '#CBD5E1', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
      aria-checked={checked}>
      <span className="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200"
        style={{ marginTop: 2, marginLeft: checked ? 18 : 2 }} />
    </button>
  )
}

function ArrowBtn({ dir, disabled, onClick }: { dir: 'up' | 'down'; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 20, height: 20,
        background: disabled ? 'transparent' : '#F1F5F9',
        color: disabled ? '#CBD5E1' : '#64748B',
        cursor: disabled ? 'default' : 'pointer',
        border: disabled ? '1px solid transparent' : '1px solid #E2E8F0',
      }}
      title={dir === 'up' ? 'Move up' : 'Move down'}>
      {dir === 'up'
        ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
        : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      }
    </button>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold"
      style={{ background: type === 'success' ? '#D1FAE5' : '#FEE2E2', color: type === 'success' ? '#065F46' : '#991B1B', border: `1px solid ${type === 'success' ? '#6EE7B7' : '#FECACA'}` }}>
      {message}
      <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
    </div>
  )
}

// ── Add Field Modal ────────────────────────────────────────────────────────────
function AddFieldModal({ defaultSection, sections, onAdd, onClose }: {
  defaultSection: string; sections: string[]
  onAdd: (data: Record<string, any>) => Promise<void>; onClose: () => void
}) {
  const [form, setForm] = useState({
    label: '', field_key: '', field_type: 'text',
    placeholder: '', section: defaultSection || sections[0] || '',
    col_span: 'third', textarea_rows: 3,
    is_visible: true, is_required: false, options: [] as string[],
  })
  const [keyEdited, setKeyEdited] = useState(false)
  const [newOption, setNewOption] = useState('')
  const [saving, setSaving]       = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const autoKey = (label: string) =>
    label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '').slice(0, 50)

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleLabelChange = (val: string) => {
    setForm(f => ({ ...f, label: val, field_key: keyEdited ? f.field_key : autoKey(val) }))
    if (errors.label) setErrors(e => ({ ...e, label: '' }))
  }
  const handleKeyChange = (val: string) => {
    setKeyEdited(true)
    setF('field_key', val.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 50))
    if (errors.field_key) setErrors(e => ({ ...e, field_key: '' }))
  }
  const handleTypeChange = (val: string) => {
    setF('field_type', val)
    if (val === 'textarea') setF('col_span', 'full')
    else if (form.col_span === 'full' && val !== 'textarea') setF('col_span', 'third')
  }
  const addOption = () => {
    if (!newOption.trim()) return
    setF('options', [...form.options, newOption.trim()]); setNewOption('')
  }
  const removeOption = (i: number) => setF('options', form.options.filter((_: any, idx: number) => idx !== i))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.label.trim()) e.label = 'Label is required'
    if (!form.field_key.trim()) e.field_key = 'Field key is required'
    if (form.field_key && !/^[a-z][a-z0-9_]*$/.test(form.field_key))
      e.field_key = 'Must start with a letter; only a–z, 0–9, underscores'
    if (form.field_type === 'select' && form.options.length === 0)
      e.options = 'Add at least one option'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await onAdd({
        label:         form.label,
        field_key:     form.field_key,
        field_type:    form.field_type,
        placeholder:   !NO_PLACEHOLDER.includes(form.field_type) ? (form.placeholder || null) : null,
        section:       form.section || null,
        col_span:      form.col_span,
        textarea_rows: form.field_type === 'textarea' ? (form.textarea_rows || 3) : 3,
        is_visible:    form.is_visible,
        is_required:   form.is_required,
        options:       form.field_type === 'select' ? form.options : null,
        sort_order:    9999,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: WHITE }}>
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})` }}>
          <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>
            Add New Field
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Section</label>
            <StyledSelect
              value={form.section}
              onChange={val => setF('section', val)}
              options={sections.map((s: string) => ({ value: s, label: s }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
              Label <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.label} onChange={e => handleLabelChange(e.target.value)}
              placeholder="Field label shown on profile"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: errors.label ? '#ef4444' : '#CBD5E1', color: NAVY }} />
            {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
              Field Key / ID <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.field_key} onChange={e => handleKeyChange(e.target.value)}
              placeholder="Auto generated from label" className="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none"
              style={{ borderColor: errors.field_key ? '#ef4444' : '#CBD5E1', color: '#475569' }} />
            {errors.field_key
              ? <p className="text-xs text-red-500 mt-1">{errors.field_key}</p>
              : <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers and underscores only.</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
              Field Type <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {FIELD_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => handleTypeChange(t.value)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all"
                  style={{
                    background:  form.field_type === t.value ? `linear-gradient(90deg, ${NAVY}, ${TEAL})` : WHITE,
                    color:       form.field_type === t.value ? WHITE : NAVY,
                    borderColor: form.field_type === t.value ? 'transparent' : '#CBD5E1',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Width</label>
              <div className="flex gap-1">
                {WIDTH_OPTS.map(w => (
                  <button key={w.value} type="button" onClick={() => setF('col_span', w.value)}
                    className="flex-1 py-1 rounded-lg text-xs font-bold border transition-all"
                    style={{
                      background:  form.col_span === w.value ? `linear-gradient(90deg, ${NAVY}, ${TEAL})` : WHITE,
                      color:       form.col_span === w.value ? WHITE : NAVY,
                      borderColor: form.col_span === w.value ? 'transparent' : '#CBD5E1',
                    }}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            {form.field_type === 'textarea' && (
              <div style={{ width: 80 }}>
                <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Rows</label>
                <input type="number" min={1} max={20} value={form.textarea_rows}
                  onChange={e => setF('textarea_rows', parseInt(e.target.value) || 3)}
                  className="w-full rounded-lg border px-2 py-1 text-sm text-center focus:outline-none"
                  style={{ borderColor: '#CBD5E1', color: NAVY }} />
              </div>
            )}
          </div>

          {!NO_PLACEHOLDER.includes(form.field_type) && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Placeholder</label>
              <input type="text" value={form.placeholder} onChange={e => setF('placeholder', e.target.value)}
                placeholder="Hint text shown inside the input"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: '#CBD5E1', color: NAVY }} />
            </div>
          )}

          {form.field_type === 'select' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
                Options <span className="text-red-500">*</span>
              </label>
              <div className="space-y-1.5 mb-2 max-h-36 overflow-y-auto">
                {form.options.map((opt: string, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-1.5 rounded-lg text-sm" style={{ background: '#F7F9FC', color: NAVY }}>{opt}</span>
                    <button type="button" onClick={() => removeOption(i)}
                      className="text-red-400 hover:text-red-600 font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50">×</button>
                  </div>
                ))}
                {form.options.length === 0 && <p className="text-xs text-gray-400 italic">No options yet.</p>}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newOption} onChange={e => setNewOption(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                  placeholder="Type and press Enter"
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
                  style={{ borderColor: errors.options ? '#ef4444' : '#CBD5E1', color: NAVY }} />
                <button type="button" onClick={addOption}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold"
                  style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: WHITE }}>+ Add</button>
              </div>
              {errors.options && <p className="text-xs text-red-500 mt-1">{errors.options}</p>}
            </div>
          )}

          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <Toggle checked={form.is_visible} onChange={v => setF('is_visible', v)} />
              <span className="text-sm font-semibold" style={{ color: NAVY }}>Visible</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Toggle checked={form.is_required} onChange={v => setF('is_required', v)} disabled={!form.is_visible} />
              <span className="text-sm font-semibold" style={{ color: NAVY }}>Required</span>
            </label>
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3 justify-end border-t border-gray-100 pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, opacity: saving ? 0.65 : 1, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em' }}>
            {saving ? 'Adding…' : 'Add Field'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Field Modal ──────────────────────────────────────────────────────────
function EditFieldModal({ field, sections, onSave, onClose }: {
  field: Record<string, any>; sections: string[]
  onSave: (data: Record<string, any>) => Promise<void>; onClose: () => void
}) {
  const [form, setForm] = useState({
    label:         field.label || '',
    field_type:    field.fieldType || field.field_type || 'text',
    placeholder:   field.placeholder || '',
    section:       field.section || sections[0] || '',
    col_span:      field.colSpan || field.col_span || 'third',
    textarea_rows: field.textareaRows || field.textarea_rows || 3,
    is_visible:    field.isVisible ?? field.is_visible ?? true,
    is_required:   field.isRequired ?? field.is_required ?? false,
    options:       Array.isArray(field.options) ? [...field.options] : [],
  })
  const [newOption, setNewOption] = useState('')
  const [saving, setSaving]       = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const handleTypeChange = (val: string) => {
    setF('field_type', val)
    if (val === 'textarea') setF('col_span', 'full')
    else if (form.col_span === 'full' && val !== 'textarea') setF('col_span', 'third')
  }
  const addOption    = () => { if (!newOption.trim()) return; setF('options', [...form.options, newOption.trim()]); setNewOption('') }
  const removeOption = (i: number) => setF('options', form.options.filter((_: any, idx: number) => idx !== i))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.label.trim()) e.label = 'Label is required'
    if (form.field_type === 'select' && form.options.length === 0) e.options = 'Add at least one option'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await onSave({
        field_key:     field.fieldKey || field.field_key,
        sort_order:    field.sortOrder ?? field.sort_order ?? 0,
        label:         form.label.trim(),
        field_type:    form.field_type,
        placeholder:   !NO_PLACEHOLDER.includes(form.field_type) ? (form.placeholder || null) : null,
        section:       form.section || null,
        col_span:      form.col_span,
        textarea_rows: form.field_type === 'textarea' ? (form.textarea_rows || 3) : 3,
        is_visible:    form.is_visible,
        is_required:   form.is_required,
        options:       form.field_type === 'select' ? form.options : null,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: WHITE }}>
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})` }}>
          <div>
            <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>Edit Field</h3>
            <p className="text-xs text-white/60 mt-0.5 font-mono">{field.fieldKey || field.field_key}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Section</label>
            <StyledSelect
              value={form.section}
              onChange={val => setF('section', val)}
              options={sections.map((s: string) => ({ value: s, label: s }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
              Label <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.label}
              onChange={e => { setF('label', e.target.value); if (errors.label) setErrors(p => ({ ...p, label: '' })) }}
              placeholder="Field label"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: errors.label ? '#ef4444' : '#CBD5E1', color: NAVY }} />
            {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Field Type</label>
            <div className="flex gap-1.5 flex-wrap">
              {FIELD_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => handleTypeChange(t.value)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all"
                  style={{
                    background:  form.field_type === t.value ? `linear-gradient(90deg, ${NAVY}, ${TEAL})` : WHITE,
                    color:       form.field_type === t.value ? WHITE : NAVY,
                    borderColor: form.field_type === t.value ? 'transparent' : '#CBD5E1',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Width</label>
              <div className="flex gap-1">
                {WIDTH_OPTS.map(w => (
                  <button key={w.value} type="button" onClick={() => setF('col_span', w.value)}
                    className="flex-1 py-1 rounded-lg text-xs font-bold border transition-all"
                    style={{
                      background:  form.col_span === w.value ? `linear-gradient(90deg, ${NAVY}, ${TEAL})` : WHITE,
                      color:       form.col_span === w.value ? WHITE : NAVY,
                      borderColor: form.col_span === w.value ? 'transparent' : '#CBD5E1',
                    }}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            {form.field_type === 'textarea' && (
              <div style={{ width: 80 }}>
                <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Rows</label>
                <input type="number" min={1} max={20} value={form.textarea_rows}
                  onChange={e => setF('textarea_rows', parseInt(e.target.value) || 3)}
                  className="w-full rounded-lg border px-2 py-1 text-sm text-center focus:outline-none"
                  style={{ borderColor: '#CBD5E1', color: NAVY }} />
              </div>
            )}
          </div>

          {!NO_PLACEHOLDER.includes(form.field_type) && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>Placeholder</label>
              <input type="text" value={form.placeholder} onChange={e => setF('placeholder', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: '#CBD5E1', color: NAVY }} />
            </div>
          )}

          {form.field_type === 'select' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
                Options <span className="text-red-500">*</span>
              </label>
              <div className="space-y-1.5 mb-2 max-h-36 overflow-y-auto">
                {form.options.map((opt: string, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-1.5 rounded-lg text-sm" style={{ background: '#F7F9FC', color: NAVY }}>{opt}</span>
                    <button type="button" onClick={() => removeOption(i)}
                      className="text-red-400 hover:text-red-600 font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newOption} onChange={e => setNewOption(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                  placeholder="Type and press Enter"
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
                  style={{ borderColor: errors.options ? '#ef4444' : '#CBD5E1', color: NAVY }} />
                <button type="button" onClick={addOption}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold"
                  style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: WHITE }}>+ Add</button>
              </div>
              {errors.options && <p className="text-xs text-red-500 mt-1">{errors.options}</p>}
            </div>
          )}

          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <Toggle checked={form.is_visible} onChange={v => setF('is_visible', v)} />
              <span className="text-sm font-semibold" style={{ color: NAVY }}>Visible</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Toggle checked={form.is_required} onChange={v => setF('is_required', v)} disabled={!form.is_visible} />
              <span className="text-sm font-semibold" style={{ color: NAVY }}>Required</span>
            </label>
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3 justify-end border-t border-gray-100 pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, opacity: saving ? 0.65 : 1, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Options Modal ────────────────────────────────────────────────────────
function EditOptionsModal({ field, onSave, onClose }: {
  field: Record<string, any>; onSave: (opts: string[]) => void; onClose: () => void
}) {
  const [options, setOptions] = useState<string[]>([...(field.options || [])])
  const [newOption, setNewOption] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')

  const addOption    = () => { if (!newOption.trim()) return; setOptions(o => [...o, newOption.trim()]); setNewOption('') }
  const removeOption = (i: number) => setOptions(o => o.filter((_, idx) => idx !== i))
  const startEdit    = (i: number) => { setEditIdx(i); setEditVal(options[i]) }
  const commitEdit   = () => {
    if (!editVal.trim()) return
    setOptions(o => o.map((opt, i) => i === editIdx ? editVal.trim() : opt))
    setEditIdx(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ background: WHITE }}>
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})` }}>
          <div>
            <h3 className="text-base font-black text-white" style={{ fontFamily: "'Aptos', sans-serif" }}>Edit Options</h3>
            <p className="text-xs text-white/70">{field.label}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5">
          <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                {editIdx === i ? (
                  <>
                    <input type="text" value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && commitEdit()} autoFocus
                      className="flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none"
                      style={{ borderColor: TEAL, color: NAVY }} />
                    <button onClick={commitEdit} className="text-xs font-bold px-2 py-1 rounded"
                      style={{ background: TEAL, color: WHITE }}>✓</button>
                    <button onClick={() => setEditIdx(null)} className="text-xs text-gray-400 px-1">✕</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 px-3 py-1.5 rounded-lg text-sm" style={{ color: NAVY, background: '#F7F9FC' }}>{opt}</span>
                    <button onClick={() => startEdit(i)} className="text-blue-400 hover:text-blue-600 text-sm px-1">✎</button>
                    <button onClick={() => removeOption(i)}
                      className="text-red-400 hover:text-red-600 font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50">×</button>
                  </>
                )}
              </div>
            ))}
            {options.length === 0 && <p className="text-sm text-gray-400 text-center py-3 italic">No options. Add below.</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newOption} onChange={e => setNewOption(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
              placeholder="New option…"
              className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
              style={{ borderColor: '#CBD5E1', color: NAVY }} />
            <button onClick={addOption} className="px-4 py-1.5 rounded-lg text-sm font-bold"
              style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, color: WHITE }}>+ Add</button>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3 justify-end border-t border-gray-100 pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
          <button onClick={() => onSave(options)} className="px-5 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em' }}>
            Save Options
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────────
function SectionHeader({ name, hasFields, isFirst, isLast, onRename, onDelete, onMoveUp, onMoveDown }: {
  name: string; hasFields: boolean; isFirst: boolean; isLast: boolean
  onRename: (n: string) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(name)

  const commit = () => {
    if (val.trim() && val.trim() !== name) onRename(val.trim())
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5"
      style={{ background: '#F1F5FA', borderBottom: '2px solid #E2E8F0' }}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <ArrowBtn dir="up"   disabled={isFirst} onClick={onMoveUp} />
          <ArrowBtn dir="down" disabled={isLast}  onClick={onMoveDown} />
        </div>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: TEAL }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
        </svg>
        {editing ? (
          <input type="text" value={val} autoFocus onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            className="rounded-lg border px-2 py-0.5 text-sm font-bold focus:outline-none focus:ring-2"
            style={{ color: NAVY, borderColor: TEAL, fontFamily: "'Aptos', sans-serif", minWidth: 180 }} />
        ) : (
          <span className="text-sm font-bold" style={{ color: NAVY, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.03em' }}>
            {name}
          </span>
        )}
        <button onClick={() => { setEditing(true); setVal(name) }} className="text-gray-400 hover:text-gray-600" title="Rename section">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
      {!hasFields && (
        <button onClick={onDelete} className="text-xs font-semibold px-2 py-1 rounded" style={{ color: '#ef4444' }}>
          Delete Section
        </button>
      )}
    </div>
  )
}

// ── Field Row ──────────────────────────────────────────────────────────────────
function FieldRow({ field, sectionIndex, sectionLength, onChange, onInstantSave, onEditOptions, onDelete, onEdit, onMoveUp, onMoveDown }: {
  field: Record<string, any>; sectionIndex: number; sectionLength: number
  onChange: (changes: Record<string, any>) => void
  onInstantSave: (changes: Record<string, any>) => Promise<void>
  onEditOptions: () => void
  onDelete: () => void; onEdit: () => void; onMoveUp: () => void; onMoveDown: () => void
}) {
  const [flashSaved, setFlashSaved] = useState(false)
  const [instantSaving, setInstantSaving] = useState(false)

  const fieldType    = field.fieldType || field.field_type || 'text'
  const colSpan      = field.colSpan   || field.col_span   || 'third'
  const isVisible    = field.isVisible ?? field.is_visible ?? true
  const isRequired   = field.isRequired ?? field.is_required ?? false
  const isCore       = field.isCore    ?? field.is_core    ?? false
  const showPlaceholder = !NO_PLACEHOLDER.includes(fieldType)

  const W = { arrows: 44, num: 24, label: 210, width: 132, type: 80, options: 80, visible: 96, required: 110, del: 36, edit: 36 }

  const doInstantSave = async (changes: Record<string, any>) => {
    // Normalise: set both camelCase and snake_case so display reads the right value
    const normalised = { ...changes }
    if ('col_span'    in changes) normalised.colSpan    = changes.col_span
    if ('is_visible'  in changes) normalised.isVisible  = changes.is_visible
    if ('is_required' in changes) normalised.isRequired = changes.is_required
    onChange(normalised)
    setInstantSaving(true)
    try {
      await onInstantSave(changes)
      setFlashSaved(true)
      setTimeout(() => setFlashSaved(false), 1500)
    } finally {
      setInstantSaving(false)
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #F1F5F9', background: sectionIndex % 2 === 0 ? WHITE : '#FAFBFC' }}>
      <div className="flex items-center px-4 py-2" style={{ gap: 8 }}>

        <div className="flex flex-col gap-0.5 flex-shrink-0" style={{ width: W.arrows }}>
          <ArrowBtn dir="up"   disabled={sectionIndex === 0}                 onClick={onMoveUp} />
          <ArrowBtn dir="down" disabled={sectionIndex === sectionLength - 1} onClick={onMoveDown} />
        </div>

        <div className="flex-shrink-0 text-xs text-left" style={{ width: W.num, color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>
          {String(sectionIndex + 1).padStart(2, '0')}
        </div>

        <div className="flex-shrink-0 space-y-1.5" style={{ width: W.label }}>
          <input type="text" value={field.label} onChange={e => onChange({ label: e.target.value })}
            placeholder="Field label"
            className="w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 transition-colors"
            style={{ borderColor: '#CBD5E1', color: NAVY, fontFamily: "'Aptos', sans-serif", fontWeight: 600 }} />
          {showPlaceholder && (
            <input type="text" value={field.placeholder || ''} onChange={e => onChange({ placeholder: e.target.value })}
              placeholder="Placeholder…"
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none transition-colors"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }} />
          )}
        </div>

        <div className="flex-shrink-0" style={{ width: W.width }}>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: flashSaved ? '#6EE7B7' : '#CBD5E1', transition: 'border-color 0.3s' }}>
            {WIDTH_OPTS.map(w => (
              <button key={w.value} type="button"
                disabled={instantSaving}
                onClick={() => { if (colSpan !== w.value) doInstantSave({ col_span: w.value }) }}
                className="flex-1 text-xs font-bold py-1.5 transition-all"
                style={{
                  background:  colSpan === w.value
                    ? flashSaved ? 'linear-gradient(90deg, #059669, #10B981)' : `linear-gradient(90deg, ${NAVY}, ${TEAL})`
                    : WHITE,
                  color:       colSpan === w.value ? WHITE : '#64748B',
                  borderRight: w.value !== 'third' ? '1px solid #CBD5E1' : 'none',
                  cursor:      instantSaving ? 'wait' : 'pointer',
                }}>
                {colSpan === w.value && flashSaved ? '✓' : w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0" style={{ width: W.type }}>
          <TypeBadge type={fieldType} />
        </div>

        {/* Options */}
        <div className="flex-shrink-0" style={{ width: W.options }}>
          {fieldType === 'select' ? (
            <button onClick={onEditOptions}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors"
              style={{ color: TEAL, borderColor: 'rgba(30,132,150,0.35)', background: 'rgba(30,132,150,0.06)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(30,132,150,0.35)' }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {(Array.isArray(field.options) ? field.options.length : 0)} opts
            </button>
          ) : (
            <span className="text-xs font-semibold" style={{ color: '#CBD5E1' }}>N/A</span>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-1.5" style={{ width: W.visible }}>
          <Toggle checked={isVisible} disabled={isCore}
            onChange={val => doInstantSave({ is_visible: val, is_required: val ? isRequired : false })} />
          <span className="text-xs font-semibold" style={{ color: '#64748B' }}>Visible</span>
        </div>

        <div className="flex-shrink-0 flex items-center gap-1.5" style={{ width: W.required }}>
          <Toggle checked={isRequired} disabled={!isVisible}
            onChange={val => doInstantSave({ is_required: val })} />
          <span className="text-xs font-semibold" style={{ color: '#64748B' }}>Required</span>
        </div>

        <div className="flex-shrink-0 flex justify-center" style={{ width: W.del }}>
          {isCore ? <CoreBadge /> : (
            <button onClick={onDelete}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: '#F87171' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title="Delete field">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-shrink-0 flex justify-center" style={{ width: W.edit }}>
          <button onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: '#3B82F6' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            title="Edit field">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main export — Profile Form Settings (admin) ───────────────────────────────
export default function ProfileFormSettings() {
  const [fields, setFields]             = useState<Record<string, any>[]>([])
  const [sectionOrder, setSectionOrder] = useState<string[]>([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)

  const [addFieldModal, setAddFieldModal]       = useState<string | null>(null)
  const [editFieldModal, setEditFieldModal]     = useState<Record<string, any> | null>(null)
  const [editOptionsModal, setEditOptionsModal] = useState<Record<string, any> | null>(null)
  const [showAddSection, setShowAddSection]     = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [toast, setToast]                   = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const getKey = (f: Record<string, any>) => f.fieldKey || f.field_key
  const getSec = (f: Record<string, any>) => f.section || 'General'

  const loadFields = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await api.get('/crm/form-fields', { params: { form_type: 'user' } })
      const data: Record<string, any>[] = (res.data?.data ?? res.data ?? []).map((f: any) =>
        (f.fieldKey ?? f.field_key) === 'dateOfJoining' ? { ...f, label: 'CA Articles Start Date' } : f
      )
      setFields(data)
      const order: string[] = []
      data.forEach(f => { const s = getSec(f); if (!order.includes(s)) order.push(s) })
      setSectionOrder(order)
    } catch {
      setToast({ type: 'error', message: 'Failed to load form fields.' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadFields() }, [loadFields])

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, any>[]> = {}
    sectionOrder.forEach(s => { map[s] = [] })
    fields.forEach(f => { const s = getSec(f); if (!map[s]) map[s] = []; map[s].push(f) })
    return map
  }, [fields, sectionOrder])

  const updateField = (fieldKey: string, changes: Record<string, any>) =>
    setFields(fs => fs.map(f => getKey(f) === fieldKey ? { ...f, ...changes } : f))

  const moveField = (sectionName: string, idx: number, dir: number) => {
    const sf = fields.filter(f => getSec(f) === sectionName)
    const ti = idx + dir
    if (ti < 0 || ti >= sf.length) return
    const newSF = [...sf];
    [newSF[idx], newSF[ti]] = [newSF[ti], newSF[idx]]
    const result: Record<string, any>[] = []
    sectionOrder.forEach(s => {
      if (s === sectionName) result.push(...newSF)
      else result.push(...fields.filter(f => getSec(f) === s))
    })
    setFields(result)
  }

  const renameSection = (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return
    setFields(fs => fs.map(f => f.section === oldName ? { ...f, section: newName } : f))
    setSectionOrder(o => o.map(s => s === oldName ? newName : s))
  }

  const moveSection = (idx: number, dir: number) => {
    const ti = idx + dir
    if (ti < 0 || ti >= sectionOrder.length) return
    const newOrder = [...sectionOrder];
    [newOrder[idx], newOrder[ti]] = [newOrder[ti], newOrder[idx]]
    setSectionOrder(newOrder)
  }

  const deleteSection = (name: string) => {
    if (fields.some(f => getSec(f) === name)) {
      setToast({ type: 'error', message: 'Move or delete all fields in this section first.' }); return
    }
    setSectionOrder(o => o.filter(s => s !== name))
  }

  const addSection = () => {
    const n = newSectionName.trim()
    if (!n) return
    if (sectionOrder.includes(n)) { setToast({ type: 'error', message: `Section "${n}" already exists.` }); return }
    setSectionOrder(o => [...o, n]); setNewSectionName(''); setShowAddSection(false)
  }

  const handleAddField = async (fieldData: Record<string, any>) => {
    try {
      const res     = await api.post('/crm/form-fields', { ...fieldData, form_type: 'user' })
      const created = res.data?.data ?? res.data
      setFields(fs => [...fs, created])
      const sec = created.section || getSec(created)
      if (sec && !sectionOrder.includes(sec)) setSectionOrder(o => [...o, sec])
      setAddFieldModal(null)
      setToast({ type: 'success', message: `Field "${created.label}" added.` })
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.field_key?.[0] ?? err?.response?.data?.message ?? 'Failed to add field.'
      setToast({ type: 'error', message: msg })
      throw err
    }
  }

  const handleEditField = async (fieldData: Record<string, any>) => {
    try {
      await api.put('/crm/form-fields', {
        form_type: 'user',
        fields: [{
          field_key: fieldData.field_key, sort_order: fieldData.sort_order ?? 0,
          label: fieldData.label, field_type: fieldData.field_type,
          placeholder: fieldData.placeholder ?? null, is_visible: fieldData.is_visible,
          is_required: fieldData.is_required, section: fieldData.section ?? null,
          col_span: fieldData.col_span ?? 'third', textarea_rows: fieldData.textarea_rows ?? 3,
          options: fieldData.options ?? null,
        }],
      })
      setFields(fs => fs.map(f => getKey(f) === fieldData.field_key ? { ...f, ...fieldData, fieldKey: fieldData.field_key } : f))
      if (fieldData.section && !sectionOrder.includes(fieldData.section))
        setSectionOrder(o => [...o, fieldData.section])
      setEditFieldModal(null)
      setToast({ type: 'success', message: `Field "${fieldData.label}" updated.` })
    } catch (err: any) {
      setToast({ type: 'error', message: err?.response?.data?.message ?? 'Failed to update field.' })
      throw err
    }
  }

  const handleInstantSave = async (fieldKey: string, changes: Record<string, any>) => {
    const field = fields.find(f => getKey(f) === fieldKey)
    if (!field) return
    const merged = { ...field, ...changes }
    await api.put('/crm/form-fields', {
      form_type: 'user',
      fields: [{
        field_key:     fieldKey,
        label:         merged.label,
        placeholder:   merged.placeholder ?? null,
        is_visible:    merged.isVisible ?? merged.is_visible ?? true,
        is_required:   merged.isRequired ?? merged.is_required ?? false,
        sort_order:    merged.sortOrder ?? merged.sort_order ?? 0,
        section:       merged.section ?? null,
        col_span:      merged.colSpan ?? merged.col_span ?? changes.col_span ?? 'third',
        textarea_rows: merged.textareaRows ?? merged.textarea_rows ?? 3,
        options:       merged.options ?? null,
      }],
    })
  }

  const handleDeleteField = async (fk: string) => {
    if (!window.confirm('Delete this field? This cannot be undone.')) return
    try {
      await api.delete(`/crm/form-fields/user/${fk}`)
      setFields(fs => fs.filter(f => getKey(f) !== fk))
      setToast({ type: 'success', message: 'Field deleted.' })
    } catch (err: any) {
      setToast({ type: 'error', message: err?.response?.data?.message ?? 'Failed to delete field.' })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const ordered: Record<string, any>[] = []
      sectionOrder.forEach(s => { if (grouped[s]) ordered.push(...grouped[s]) })
      await api.put('/crm/form-fields', {
        form_type: 'user',
        fields: ordered.map((f, i) => ({
          field_key:     getKey(f),
          label:         f.label,
          placeholder:   f.placeholder ?? null,
          is_visible:    f.isVisible ?? f.is_visible,
          is_required:   f.isRequired ?? f.is_required,
          sort_order:    i + 1,
          section:       f.section ?? null,
          options:       f.options ?? null,
          col_span:      f.colSpan ?? f.col_span ?? 'third',
          textarea_rows: f.textareaRows ?? f.textarea_rows ?? 3,
        })),
      })
      setToast({ type: 'success', message: 'Profile form configuration saved!' })
    } catch {
      setToast({ type: 'error', message: 'Failed to save changes.' })
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: TEAL }} />
      </div>
    )
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}


      {sectionOrder.map((sectionName, si) => {
        const sectionFields = grouped[sectionName] || []
        return (
          <div key={sectionName} className="mb-4 rounded-xl overflow-hidden"
            style={{ background: WHITE, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>

            <SectionHeader
              name={sectionName} hasFields={sectionFields.length > 0}
              isFirst={si === 0} isLast={si === sectionOrder.length - 1}
              onRename={n => renameSection(sectionName, n)}
              onDelete={() => deleteSection(sectionName)}
              onMoveUp={() => moveSection(si, -1)}
              onMoveDown={() => moveSection(si, 1)}
            />

            {sectionFields.length > 0 && (
              <div className="flex items-center px-4 py-1 text-xs font-bold uppercase tracking-wide"
                style={{ gap: 8, color: '#94A3B8', background: '#FAFBFC', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ width: 44 }} />
                <div style={{ width: 24 }} />
                <div style={{ width: 210 }}>Label / Placeholder</div>
                <div style={{ width: 132 }}>Width</div>
                <div style={{ width: 80 }}>Type</div>
                <div style={{ width: 80 }}>Options</div>
                <div style={{ width: 96 }}>Visible</div>
                <div style={{ width: 110 }}>Required</div>
                <div style={{ width: 36 }} />
                <div style={{ width: 36 }} />
              </div>
            )}

            {sectionFields.map((field, fi) => (
              <FieldRow
                key={getKey(field)} field={field}
                sectionIndex={fi} sectionLength={sectionFields.length}
                onChange={changes => updateField(getKey(field), changes)}
                onInstantSave={changes => handleInstantSave(getKey(field), changes)}
                onEditOptions={() => setEditOptionsModal({ ...field })}
                onDelete={() => handleDeleteField(getKey(field))}
                onEdit={() => setEditFieldModal({ ...field })}
                onMoveUp={() => moveField(sectionName, fi, -1)}
                onMoveDown={() => moveField(sectionName, fi, 1)}
              />
            ))}

            <div className="px-4 py-2.5 border-t border-dashed" style={{ borderColor: '#E2E8F0' }}>
              <button onClick={() => setAddFieldModal(sectionName)}
                className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
                style={{ color: TEAL }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Field to "{sectionName}"
              </button>
            </div>
          </div>
        )
      })}

      <div className="mb-6">
        {showAddSection ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border-2 border-dashed"
            style={{ borderColor: TEAL, background: 'rgba(30,132,150,0.04)' }}>
            <input type="text" value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setShowAddSection(false) }}
              placeholder="Section name, e.g. Insurance Details" autoFocus
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: TEAL, color: NAVY }} />
            <button onClick={addSection} className="px-4 py-2 rounded-lg text-sm font-bold text-white"
              style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})` }}>Create</button>
            <button onClick={() => setShowAddSection(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowAddSection(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed w-full text-sm font-semibold"
            style={{ borderColor: '#CBD5E1', color: '#64748B' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Section
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          Reordering, label edits, width and toggle changes are saved together via Save All.
          New fields and deletions apply immediately.
        </p>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 rounded-xl font-bold text-white"
          style={{
            background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`,
            fontFamily: "'Aptos', sans-serif", fontSize: '1rem',
            letterSpacing: '0.05em', opacity: saving ? 0.65 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(30,132,150,0.25)',
          }}>
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>

      {addFieldModal !== null && (
        <AddFieldModal
          defaultSection={addFieldModal} sections={sectionOrder}
          onAdd={handleAddField} onClose={() => setAddFieldModal(null)}
        />
      )}
      {editFieldModal && (
        <EditFieldModal
          field={editFieldModal} sections={sectionOrder}
          onSave={handleEditField} onClose={() => setEditFieldModal(null)}
        />
      )}
      {editOptionsModal && (
        <EditOptionsModal
          field={editOptionsModal}
          onSave={opts => { updateField(getKey(editOptionsModal), { options: opts }); setEditOptionsModal(null) }}
          onClose={() => setEditOptionsModal(null)}
        />
      )}
    </div>
  )
}
