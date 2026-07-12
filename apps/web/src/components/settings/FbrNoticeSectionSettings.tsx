'use client'
import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import StyledSelect from '@/components/ui/StyledSelect'

const NAVY  = '#132E57'
const TEAL  = '#1E8496'
const GOLD  = '#F2AC18'
const BORDER = '#E2E8F0'

const TAX_TABS = [
  { key: 'INCOME_TAX', label: 'Income Tax',      color: '#7B2D8E' },
  { key: 'SALES_TAX',  label: 'Sales Tax',        color: '#1E8496' },
  { key: 'WHT',        label: 'Withholding Tax',  color: '#C25A1F' },
  { key: 'OTHER',      label: 'Other',             color: '#6B7280' },
]

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  fontFamily: "'Aptos', sans-serif", marginBottom: 5,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: "'Aptos', sans-serif",
  outline: 'none', color: NAVY, background: '#fff',
}

export default function FbrNoticeSectionSettings() {
  const [activeTax, setActiveTax]   = useState('INCOME_TAX')
  const [sections,  setSections]    = useState<any[]>([])
  const [loading,   setLoading]     = useState(false)
  const [newSection, setNewSection] = useState('')
  const [saving,    setSaving]      = useState(false)
  const [toast,     setToast]       = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchSections = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/fbr/notice-sections?taxType=${activeTax}`)
      const data = res.data?.data ?? res.data ?? []
      setSections(Array.isArray(data) ? data : [])
    } catch { setSections([]) }
    finally { setLoading(false) }
  }, [activeTax])

  useEffect(() => { fetchSections() }, [fetchSections])

  const addSection = async () => {
    const s = newSection.trim()
    if (!s) return
    setSaving(true)
    try {
      await api.post('/fbr/notice-sections', { taxType: activeTax, section: s, sortOrder: sections.length + 1 })
      setNewSection('')
      await fetchSections()
      showToast('Section added.', true)
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Failed to add', false)
    } finally { setSaving(false) }
  }

  const removeSection = async (id: string) => {
    try {
      await api.delete(`/fbr/notice-sections/${id}`)
      setSections(prev => prev.filter(s => s.id !== id))
      showToast('Section removed.', true)
    } catch { showToast('Failed to remove', false) }
  }

  const activeTab = TAX_TABS.find(t => t.key === activeTax)!

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 18, right: 24, zIndex: 9999, padding: '10px 18px', borderRadius: 10, background: toast.ok ? '#065F46' : '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: "'Aptos', sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
          {toast.msg}
        </div>
      )}

      {/* Tax type tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TAX_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTax(t.key)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: `2px solid ${activeTax === t.key ? t.color : BORDER}`,
              background: activeTax === t.key ? t.color : '#fff', color: activeTax === t.key ? '#fff' : '#64748B',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif", transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Add new section */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 20 }}>
        <label style={labelStyle}>Add Notice Section: {activeTab.label}</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={newSection}
            onChange={e => setNewSection(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSection()}
            placeholder="e.g. U/S 122(9)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addSection} disabled={saving || !newSection.trim()}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: GOLD, color: NAVY, fontSize: 13, fontWeight: 700, cursor: saving || !newSection.trim() ? 'default' : 'pointer', opacity: saving || !newSection.trim() ? 0.6 : 1, fontFamily: "'Aptos', sans-serif", whiteSpace: 'nowrap' }}>
            {saving ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Sections list */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: "'Aptos', sans-serif", textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {activeTab.label} Notice Sections
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: "'Aptos', sans-serif" }}>
            {sections.length} section{sections.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: "'Aptos', sans-serif" }}>Loading…</div>
        ) : sections.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13, fontFamily: "'Aptos', sans-serif" }}>
            No sections yet. Add one above.
          </div>
        ) : (
          sections.map((s, idx) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderBottom: idx < sections.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: activeTab.color + '18', color: activeTab.color, fontSize: 10, fontWeight: 800, fontFamily: "'Aptos', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {idx + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, fontFamily: "'Aptos', sans-serif" }}>{s.section}</span>
              </div>
              <button onClick={() => removeSection(s.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}
                title="Remove section">
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
