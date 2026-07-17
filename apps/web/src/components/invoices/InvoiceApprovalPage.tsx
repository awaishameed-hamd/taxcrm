'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const money   = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

const KIND_META: Record<string, { label: string; color: string; bg: string }> = {
  TASK:     { label: 'Task',     color: '#1E40AF', bg: '#DBEAFE' },
  RETAINER: { label: 'Retainer', color: '#5B21B6', bg: '#EDE9FE' },
  MANUAL:   { label: 'Manual',   color: '#5C5C5C', bg: '#F1F5F9' },
}
const FILTERS = [
  { key: 'ALL',      label: 'All' },
  { key: 'TASK',     label: 'Task' },
  { key: 'RETAINER', label: 'Retainer' },
  { key: 'MANUAL',   label: 'Manual' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${P.border}`, fontSize: 13, outline: 'none', fontFamily: F,
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#5C5C5C', marginBottom: 4, fontFamily: F,
}
const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 700, fontFamily: F, background: bg, color,
})

function StatCard({ label, value, border, fill }: { label: string; value: string | number; border: string; fill: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827', fontFamily: '"Aptos", sans-serif' }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// ─── Price the draft before it goes out ───────────────────────────────────────
function PriceModal({ inv, onClose, onSaved }: { inv: any; onClose: () => void; onSaved: () => void }) {
  const [subtotal,    setSubtotal]    = useState(inv.subtotal    != null ? String(Number(inv.subtotal))    : '')
  const [salesTax,    setSalesTax]    = useState(inv.salesTax    != null ? String(Number(inv.salesTax))    : '')
  const [outOfPocket, setOutOfPocket] = useState(inv.outOfPocket != null ? String(Number(inv.outOfPocket)) : '')
  const [description, setDescription] = useState(inv.description ?? '')
  const [dueDate,     setDueDate]     = useState(inv.dueDate ? inv.dueDate.split('T')[0] : '')
  const [notes,       setNotes]       = useState(inv.notes ?? '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const nSub  = Number(subtotal) || 0
  const nTax  = Number(salesTax) || 0
  const nOop  = Number(outOfPocket) || 0
  const total = nSub + nTax + nOop

  async function save(alsoSend: boolean) {
    if (alsoSend && total <= 0) { setError('Set an amount before sending'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/invoices/${inv.id}`, {
        subtotal: nSub, salesTax: nTax, outOfPocket: nOop,
        description, dueDate: dueDate || undefined, notes,
      })
      if (alsoSend) await api.post(`/invoices/${inv.id}/send`)
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 470, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 19, display: 'inline-block', transform: 'skewX(12deg)', color: '#F1F5F9', margin: 0 }}>
            {inv.invoiceNumber}
          </h2>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: F }}>
            {inv.client?.businessName ?? inv.client?.user?.fullName}
          </span>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Professional Fee <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="number" min={0} value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="0" style={inputStyle} autoFocus />
            {inv.kind === 'RETAINER' && (
              <p style={{ margin: '5px 0 0', fontSize: 11, color: '#5B21B6', fontFamily: F, fontWeight: 700 }}>
                Pre-filled from the client's agreed monthly retainer
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Sales Tax</label>
              <input type="number" min={0} value={salesTax} onChange={e => setSalesTax(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Out of Pocket</label>
              <input type="number" min={0} value={outOfPocket} onChange={e => setOutOfPocket(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          <div style={{ background: '#F8FAFC', border: `1px solid ${P.border}`, borderRadius: 8, padding: '9px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B', fontFamily: F }}>Invoice Total</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: NAVY, fontFamily: F }}>{money(total)}</span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is being billed" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            <p style={{ margin: '5px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: F }}>Past this date an unpaid invoice is flagged Overdue</p>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} placeholder="Shown on the invoice" />
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
            <button onClick={() => save(false)} disabled={saving} style={{ ...btn('#fff', NAVY), border: `1px solid ${P.border}`, opacity: saving ? 0.6 : 1 }}>
              Save Draft
            </button>
            <button onClick={() => save(true)} disabled={saving || total <= 0} style={{ ...btn(TEAL), opacity: (saving || total <= 0) ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save & Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InvoiceApprovalPage() {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [kind,    setKind]    = useState('ALL')
  const [search,  setSearch]  = useState('')
  const [busy,    setBusy]    = useState<string | null>(null)

  const [priceInv,   setPriceInv]   = useState<any>(null)
  const [confirmDel, setConfirmDel] = useState<any>(null)

  const fetchDrafts = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get('/invoices', { params: { status: 'DRAFT', ...(search ? { search } : {}) } })
      .then(({ data }) => setRows(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [search])

  useEffect(() => { fetchDrafts() }, [fetchDrafts])
  useAutoRefresh(() => fetchDrafts(true))

  const visible = useMemo(() => kind === 'ALL' ? rows : rows.filter(r => r.kind === kind), [rows, kind])

  async function act(id: string, path: string) {
    setBusy(id)
    try { await api.post(`/invoices/${id}/${path}`); fetchDrafts() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Action failed') }
    finally { setBusy(null) }
  }

  async function doDelete() {
    if (!confirmDel) return
    setBusy(confirmDel.id)
    try { await api.delete(`/invoices/${confirmDel.id}`); setConfirmDel(null); fetchDrafts() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Delete failed') }
    finally { setBusy(null) }
  }

  const td: React.CSSProperties = {
    padding: '6px 12px', borderBottom: `1px solid ${P.border}50`, fontFamily: F,
    fontSize: 13, fontWeight: 700, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  const th: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap',
  }

  const totalValue = rows.reduce((s, r) => s + Number(r.amount), 0)
  const unpriced   = rows.filter(r => Number(r.amount) <= 0).length

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: NAVY }}>
          Invoice Approval
        </h1>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
        <StatCard label="Pending Drafts" value={rows.length}                              border="#1565C0" fill="#BDDAF8" />
        <StatCard label="Needs Pricing"  value={unpriced}                                 border="#DC2626" fill="#FECACA" />
        <StatCard label="Retainer"       value={rows.filter(r => r.kind === 'RETAINER').length} border="#7B2D8E" fill="#E4D4EC" />
        <StatCard label="Total Value"    value={money(totalValue)}                        border="#16A34A" fill="#BBF0D6" />
      </div>

      {/* Filters */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setKind(f.key)} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: F, whiteSpace: 'nowrap',
              background: kind === f.key ? NAVY : 'transparent',
              color: kind === f.key ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>{f.label}</button>
          ))}

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 240 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search client / invoice…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
          </div>

          <span style={{ flex: 1 }} />
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', padding: '0 4px' }}>{visible.length} drafts</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '13%' }} /><col style={{ width: '18%' }} /><col style={{ width: '28%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: 210 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              {['Invoice #', 'Client', 'Description', 'Type', 'Created'].map(l => <th key={l} style={th}>{l}</th>)}
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  {Array.from({ length: 7 }).map((__, c) => (
                    <td key={c} style={td}><div style={{ height: 12, borderRadius: 4, background: P.gridLine }} /></td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>
                {search ? `No drafts matching "${search}".` : 'Nothing waiting. Drafts land here automatically when a task is completed.'}
              </td></tr>
            ) : visible.map((r, idx) => {
              const km       = KIND_META[r.kind] ?? KIND_META.MANUAL
              const disabled = busy === r.id
              const priced   = Number(r.amount) > 0
              return (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  <td style={{ ...td, color: TEAL }}>{r.invoiceNumber}</td>
                  <td style={td}>{r.client?.businessName ?? r.client?.user?.fullName ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 400 }}>{r.description ?? '—'}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: km.color, background: km.bg }}>{km.label}</span>
                  </td>
                  <td style={{ ...td, fontWeight: 400, color: '#64748B' }}>{fmtDate(r.createdAt)}</td>
                  <td style={{ ...td, textAlign: 'right', color: priced ? '#000' : '#D62828' }}>
                    {priced ? money(r.amount) : 'Not priced'}
                  </td>
                  <td style={{ ...td, overflow: 'visible' }}>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button onClick={() => setPriceInv(r)} disabled={disabled}
                        style={{ padding: '0 10px', height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', color: '#3B82F6', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                        {priced ? 'Edit' : 'Set Amount'}
                      </button>
                      <button onClick={() => act(r.id, 'send')} disabled={disabled || !priced} title={priced ? 'Send to client' : 'Set an amount first'}
                        style={{ padding: '0 10px', height: 26, borderRadius: 6, border: 'none', background: TEAL, color: '#fff', cursor: priced ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 700, fontFamily: F, opacity: (disabled || !priced) ? 0.45 : 1 }}>
                        Send
                      </button>
                      <button onClick={() => act(r.id, 'mark-retainer')} disabled={disabled} title="Covered by the monthly retainer — don't bill separately"
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7B2D8E', opacity: disabled ? 0.5 : 1 }}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      </button>
                      <button onClick={() => setConfirmDel(r)} disabled={disabled} title="Delete"
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {priceInv && <PriceModal inv={priceInv} onClose={() => setPriceInv(null)} onSaved={() => { setPriceInv(null); fetchDrafts() }} />}

      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#D62828', fontFamily: F }}>Delete Draft?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: P.textMuted, fontFamily: F, lineHeight: 1.5 }}>
              <strong>{confirmDel.invoiceNumber}</strong> will be removed and this work won't be billed. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
              <button onClick={doDelete} style={btn('#D62828')}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
