'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'

const NAVY  = '#132E57'
const TEAL  = '#1E8496'
const GOLD  = '#F2AC18'
const BORDER = '#E2E8F0'

const TAX_TABS = [
  { key: 'SALES_TAX',  label: 'Sales Tax',      color: '#1E8496', bg: '#E5F3F5' },
  { key: 'INCOME_TAX', label: 'Income Tax',      color: '#7B2D8E', bg: '#F3E8F7' },
  { key: 'WHT',        label: 'Withholding Tax', color: '#C25A1F', bg: '#F5E0D2' },
]

interface Step {
  id: string
  stepKey: string
  label: string
  description: string | null
  approvedBy: string
  displayOrder: number
  isActive: boolean
}

export default function TaxReturnSettings({ initialType = 'SALES_TAX' }: { initialType?: string }) {
  const [activeType, setActiveType] = useState(initialType)
  const [steps,      setSteps]      = useState<Step[]>([])
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editForm,   setEditForm]   = useState({ label: '', description: '', approvedBy: 'TRAINEE' })
  const [reordering, setReordering] = useState(false)
  const [addOpen,    setAddOpen]    = useState(false)
  const [addForm,    setAddForm]    = useState({ label: '', description: '', approvedBy: 'TRAINEE' })
  const [addSaving,  setAddSaving]  = useState(false)

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const fetchSteps = useCallback(async () => {
    setLoading(true)
    setEditId(null)
    try {
      const { data } = await api.get('/pipeline-steps', { params: { taskType: activeType } })
      const rows = Array.isArray(data) ? data : (data?.data ?? [])
      console.log('[TaxReturnSettings] fetched', rows.length, 'steps for', activeType)
      setSteps(rows)
    } catch (e: any) {
      console.error('[TaxReturnSettings] fetch error:', e?.response?.status, e?.response?.data ?? e?.message)
      setSteps([])
    }
    finally { setLoading(false) }
  }, [activeType])

  useEffect(() => { fetchSteps() }, [fetchSteps])

  const addStep = async () => {
    if (!addForm.label.trim()) return
    setAddSaving(true)
    try {
      const { data } = await api.post('/pipeline-steps', { taskType: activeType, ...addForm })
      const newStep = data?.data ?? data
      setSteps(prev => [...prev, newStep])
      setAddOpen(false)
      setAddForm({ label: '', description: '', approvedBy: 'TRAINEE' })
      showToast('Step added')
    } catch { showToast('Failed to add step', false) }
    finally { setAddSaving(false) }
  }

  const openEdit = (s: Step) => {
    setEditId(s.id)
    setEditForm({ label: s.label, description: s.description ?? '', approvedBy: s.approvedBy })
  }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(editId)
    try {
      const { data } = await api.put(`/pipeline-steps/${editId}`, editForm)
      setSteps(prev => prev.map(s => s.id === editId ? { ...s, ...data } : s))
      setEditId(null)
      showToast('Step updated')
    } catch { showToast('Failed to save', false) }
    finally { setSaving(null) }
  }

  const toggleActive = async (step: Step) => {
    setSaving(step.id)
    try {
      const { data } = await api.put(`/pipeline-steps/${step.id}`, { isActive: !step.isActive })
      setSteps(prev => prev.map(s => s.id === step.id ? { ...s, ...data } : s))
      showToast(data.isActive ? 'Step enabled' : 'Step disabled')
    } catch { showToast('Failed', false) }
    finally { setSaving(null) }
  }

  const move = async (idx: number, dir: -1 | 1) => {
    const newSteps = [...steps]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= newSteps.length) return
    ;[newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]]
    setSteps(newSteps)
    setReordering(true)
    try {
      await api.put('/pipeline-steps/reorder/batch', { ids: newSteps.map(s => s.id) })
      showToast('Order saved')
    } catch { showToast('Failed to reorder', false); fetchSteps() }
    finally { setReordering(false) }
  }

  const activeTab = TAX_TABS.find(t => t.key === activeType)!

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
    fontFamily: "'Aptos', sans-serif",
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "'Aptos', sans-serif",
    outline: 'none', color: NAVY, background: '#fff',
  }

  return (
    <div style={{ position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: toast.ok ? '#3A6B3A' : '#D62828', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'Aptos',sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>{toast.msg}</div>
      )}

      {/* Add Step button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => { setAddOpen(o => !o); setAddForm({ label: '', description: '', approvedBy: 'TRAINEE' }) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${TEAL}`, background: addOpen ? TEAL : '#F0FAFB', color: addOpen ? '#fff' : TEAL, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif", transition: 'all .15s' }}>
          <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Step
        </button>
      </div>

      {/* Add Step form */}
      {addOpen && (
        <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${TEAL}`, padding: '16px 18px', marginBottom: 16, boxShadow: '0 2px 10px rgba(30,132,150,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: "'Aptos', sans-serif", marginBottom: 14 }}>New Step</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Step Label *</label>
            <input value={addForm.label} onChange={e => setAddForm(p => ({ ...p, label: e.target.value }))}
              style={inputStyle} placeholder="e.g. Client Confirmation…" autoFocus />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description (optional)</label>
            <textarea value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Short description of this step…"
              style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Completed By *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['TRAINEE', 'MANAGER'].map(role => (
                <button key={role} onClick={() => setAddForm(p => ({ ...p, approvedBy: role }))}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `2px solid ${addForm.approvedBy === role ? TEAL : BORDER}`, background: addForm.approvedBy === role ? '#F0FAFB' : '#fff', color: addForm.approvedBy === role ? TEAL : '#64748B', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>
                  {role}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddOpen(false)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#F8FAFC', color: '#64748B', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>Cancel</button>
            <button onClick={addStep} disabled={!addForm.label.trim() || addSaving}
              style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: addForm.label.trim() ? 'pointer' : 'not-allowed', background: `linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'Aptos', sans-serif", opacity: (!addForm.label.trim() || addSaving) ? 0.6 : 1 }}>
              {addSaving ? 'Adding…' : 'Add Step'}
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>Loading steps…</div>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map((step, idx) => {
            const isEditing = editId === step.id
            const isBusy = saving === step.id || reordering
            return (
              <div key={step.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${step.isActive ? BORDER : '#FEE2E2'}`, overflow: 'hidden', opacity: step.isActive ? 1 : 0.7, transition: 'all .2s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

                {/* Step header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: isEditing ? `1px solid ${BORDER}` : 'none' }}>

                  {/* Order number + drag handle */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => move(idx, -1)} disabled={idx === 0 || isBusy}
                      style={{ width: 22, height: 18, border: `1px solid ${BORDER}`, borderRadius: 4, background: '#F8FAFC', cursor: idx === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === 0 ? 0.3 : 1 }}>
                      <svg width={10} height={10} fill="none" viewBox="0 0 24 24" stroke="#64748B" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: step.isActive ? activeTab.color : '#CBD5E1', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Aptos', sans-serif" }}>{idx + 1}</div>
                    <button onClick={() => move(idx, 1)} disabled={idx === steps.length - 1 || isBusy}
                      style={{ width: 22, height: 18, border: `1px solid ${BORDER}`, borderRadius: 4, background: '#F8FAFC', cursor: idx === steps.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === steps.length - 1 ? 0.3 : 1 }}>
                      <svg width={10} height={10} fill="none" viewBox="0 0 24 24" stroke="#64748B" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>

                  {/* Step info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: step.isActive ? NAVY : '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>{step.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: step.approvedBy === 'MANAGER' ? '#FEF3C7' : '#EFF6FF', color: step.approvedBy === 'MANAGER' ? '#92400E' : '#1D4ED8', border: `1px solid ${step.approvedBy === 'MANAGER' ? '#FDE68A' : '#BFDBFE'}` }}>{step.approvedBy}</span>
                      {!step.isActive && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>Disabled</span>}
                    </div>
                    {step.description && !isEditing && (
                      <p style={{ margin: 0, fontSize: 12, color: '#64748B', fontFamily: "'Aptos', sans-serif", lineHeight: 1.4 }}>{step.description}</p>
                    )}
                    <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>{step.stepKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => toggleActive(step)} disabled={isBusy}
                      style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${step.isActive ? '#FEE2E2' : '#D1FAE5'}`, background: step.isActive ? '#FFF5F5' : '#F0FDF4', color: step.isActive ? '#DC2626' : '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif", opacity: isBusy ? 0.6 : 1 }}>
                      {step.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => isEditing ? setEditId(null) : openEdit(step)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${isEditing ? BORDER : TEAL}`, background: isEditing ? '#F8FAFC' : '#F0FAFB', color: isEditing ? '#64748B' : TEAL, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>
                      {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div style={{ padding: '14px 16px', background: '#FAFBFF' }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>Step Label *</label>
                      <input value={editForm.label} onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                        style={inputStyle} placeholder="Step display name…" />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>Description (optional)</label>
                      <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                        rows={2} placeholder="Short description of this step…"
                        style={{ ...inputStyle, resize: 'vertical' as const }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Approved By *</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {['TRAINEE', 'MANAGER'].map(role => (
                          <button key={role} onClick={() => setEditForm(p => ({ ...p, approvedBy: role }))}
                            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `2px solid ${editForm.approvedBy === role ? TEAL : BORDER}`, background: editForm.approvedBy === role ? '#F0FAFB' : '#fff', color: editForm.approvedBy === role ? TEAL : '#64748B', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={saveEdit} disabled={!editForm.label.trim() || saving === editId}
                        style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'Aptos', sans-serif", opacity: (!editForm.label.trim() || saving === editId) ? 0.6 : 1 }}>
                        {saving === editId ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
