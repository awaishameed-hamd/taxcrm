'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import DataTable from '@/components/ui/DataTable'
import PillSelect from '@/components/ui/PillSelect'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const money   = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

const KIND_META: Record<string, { label: string; color: string; bg: string }> = {
  TASK:     { label: 'Task',                color: '#1E40AF', bg: '#DBEAFE' },
  RETAINER: { label: 'Monthly Retainership', color: '#5B21B6', bg: '#EDE9FE' },
  ANNUAL:   { label: 'Annual Retainership',  color: '#B45309', bg: '#FDF0D5' },
  MANUAL:   { label: 'Manual',              color: '#5C5C5C', bg: '#F1F5F9' },
}
const FILTERS = [
  { key: 'ALL',      label: 'All Types' },
  { key: 'TASK',     label: 'Task' },
  { key: 'RETAINER', label: 'Monthly Retainership' },
  { key: 'ANNUAL',   label: 'Annual Retainership' },
  { key: 'MANUAL',   label: 'Manual' },
]

// Date presets over the draft's creation date
const RANGES = [
  { key: 'all',       label: 'All Time'   },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisYear',  label: 'This Year'  },
  { key: 'custom',    label: 'Custom'     },
]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function rangeDates(key: string): { from?: string; to?: string } {
  const now = new Date()
  if (key === 'thisMonth') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),     to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (key === 'lastMonth') return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
  if (key === 'thisYear')  return { from: iso(new Date(now.getFullYear(), 0, 1)),                  to: iso(new Date(now.getFullYear(), 11, 31)) }
  return {}
}

const LS_FILTERS = 'invoiceApproval:filters'

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
// Renders in place of the list, matching New Invoice and Receive Payment, so
// pricing an invoice looks the same wherever you reach it from.
function PricePanel({ inv, onClose, onSaved }: { inv: any; onClose: () => void; onSaved: () => void }) {
  const [subtotal,    setSubtotal]    = useState(inv.subtotal    != null ? String(Number(inv.subtotal))    : '')
  const [salesTax,    setSalesTax]    = useState(inv.salesTax    != null ? String(Number(inv.salesTax))    : '')
  const [outOfPocket, setOutOfPocket] = useState(inv.outOfPocket != null ? String(Number(inv.outOfPocket)) : '')
  const [description, setDescription] = useState(inv.description ?? '')
  // Default a new draft's due date to a week out; the manager can change it.
  const [dueDate,     setDueDate]     = useState(() => {
    if (inv.dueDate) return inv.dueDate.split('T')[0]
    const d = new Date(inv.issueDate ?? Date.now())
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
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
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
        {/* Header */}
        <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
              {inv.invoiceNumber}
            </h2>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: F }}>
              {inv.client?.businessName ?? inv.client?.user?.fullName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14, fontFamily: F }}>{money(total)}</span>
              <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: 12, fontFamily: F }}>Invoice Total</span>
            </span>
            <button onClick={onClose} style={{
              cursor: 'pointer', color: '#E2E8F0', fontWeight: 700,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, padding: '4px 12px', fontSize: 12, fontFamily: F,
            }}>
              ← Back
            </button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is being billed" style={inputStyle} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Professional Fee</label>
              <input type="number" min={0} value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="0" style={inputStyle} />
              {inv.kind === 'RETAINER' && (
                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#5B21B6', fontFamily: F, fontWeight: 700 }}>
                  Pre-filled from the client's agreed monthly retainer
                </p>
              )}
              {inv.kind === 'ANNUAL' && (
                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#B45309', fontFamily: F, fontWeight: 700 }}>
                  Pre-filled from the client's agreed yearly billing fee
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Sales Tax</label>
              <input type="number" min={0} value={salesTax} onChange={e => setSalesTax(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Out of Pocket</label>
              <input type="number" min={0} value={outOfPocket} onChange={e => setOutOfPocket(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth recording against this invoice" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 13, fontFamily: F, borderTop: `1px solid ${P.border}`, borderBottom: `1px solid ${P.border}` }}>
            <span style={{ fontWeight: 800, color: '#64748B' }}>Invoice Total</span>
            <span style={{ fontWeight: 900, color: NAVY }}>{money(total)}</span>
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
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
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InvoiceApprovalPage() {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [kind,    setKind]    = useState('ALL')
  const [search,  setSearch]  = useState('')
  const [range,   setRange]   = useState('all')
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')

  // The type and date filters are remembered, so a manager who works one kind of
  // draft comes back to it instead of resetting to All every visit. Read after
  // mount so the server and client first render agree.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FILTERS) ?? '{}')
      if (saved.kind)  setKind(saved.kind)
      if (saved.range) setRange(saved.range)
      if (saved.from)  setFrom(saved.from)
      if (saved.to)    setTo(saved.to)
    } catch { /* private mode, first visit */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_FILTERS, JSON.stringify({ kind, range, from, to })) } catch { /* ignore */ }
  }, [kind, range, from, to])
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

  const visible = useMemo(() => {
    const d = range === 'custom' ? { from: from || undefined, to: to || undefined } : rangeDates(range)
    // `to` names a day, so run the window to the end of it
    const fromMs = d.from ? new Date(d.from).getTime() : null
    const toMs   = d.to   ? new Date(d.to).getTime() + 86400000 : null
    return rows.filter(r => {
      if (kind !== 'ALL' && r.kind !== kind) return false
      if (fromMs === null && toMs === null)  return true
      const t = new Date(r.createdAt).getTime()
      return (fromMs === null || t >= fromMs) && (toMs === null || t < toMs)
    })
  }, [rows, kind, range, from, to])

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

  const totalValue = rows.reduce((s, r) => s + Number(r.amount), 0)
  const unpriced   = rows.filter(r => Number(r.amount) <= 0).length

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
          Invoice Approval
        </h1>
      </div>

      {priceInv ? (
        <PricePanel inv={priceInv} onClose={() => setPriceInv(null)} onSaved={() => { setPriceInv(null); fetchDrafts() }} />
      ) : (
       <>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16 }}>
        <StatCard label="Pending Drafts" value={rows.length}                              border="#1565C0" fill="#BDDAF8" />
        <StatCard label="Needs Pricing"  value={unpriced}                                 border="#DC2626" fill="#FECACA" />
        <StatCard label="Monthly Retainership" value={rows.filter(r => r.kind === "RETAINER").length} border="#7B2D8E" fill="#E4D4EC" />
        <StatCard label="Annual Retainership"  value={rows.filter(r => r.kind === "ANNUAL").length}   border="#B45309" fill="#FBE3B8" />
        <StatCard label="Total Value"    value={money(totalValue)}                        border="#16A34A" fill="#BBF0D6" />
      </div>

      {/* Filters */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>
          <PillSelect
            value={kind} onChange={setKind} dimValue="ALL" minWidth={190}
            options={FILTERS.map(f => ({ value: f.key, label: f.label }))}
          />

          <PillSelect
            value={range} onChange={setRange} dimValue="all" minWidth={140}
            options={RANGES.map(r => ({ value: r.key, label: r.label }))}
          />

          {range === 'custom' && (
            <>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 11, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700 }}>to</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 11, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
            </>
          )}

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

      <DataTable
        id="invoiceApproval" minWidth={980} rows={visible} loading={loading} skeletonRows={5}
        rowKey={(r: any) => r.id}
        emptyText={search ? `No drafts matching "${search}".` : 'Nothing waiting. Drafts land here automatically when a task is completed.'}
        columns={[
          { key: 'invoiceNumber', label: 'Invoice #', width: 120, cellStyle: { color: TEAL, fontWeight: 600 } },
          { key: 'client', label: 'Client', width: 180, cellStyle: { fontWeight: 600 },
            render: (r: any) => r.client?.businessName ?? r.client?.user?.fullName ?? '' },
          { key: 'description', label: 'Description', width: 260, render: (r: any) => r.description ?? '' },
          { key: 'kind', label: 'Type', width: 96, render: (r: any) => {
            const km = KIND_META[r.kind] ?? KIND_META.MANUAL
            return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: km.color, background: km.bg }}>{km.label}</span>
          } },
          { key: 'createdAt', label: 'Created', width: 104, cellStyle: { color: '#64748B' }, render: (r: any) => fmtDate(r.createdAt) },
          { key: 'amount', label: 'Amount', width: 100, align: 'right', render: (r: any) => (
            <span style={{ color: Number(r.amount) > 0 ? '#000' : '#D62828', fontWeight: 600 }}>
              {Number(r.amount) > 0 ? money(r.amount) : 'Not priced'}
            </span>
          ) },
          { key: 'actions', label: '', width: 243, resizable: false, cellStyle: { overflow: 'visible' }, render: (r: any) => {
            const disabled = busy === r.id
            const priced   = Number(r.amount) > 0
            return (
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button onClick={() => setPriceInv(r)} disabled={disabled}
                        style={{ padding: '0 8px', height: 20, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', color: '#3B82F6', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                        {priced ? 'Edit' : 'Set Amount'}
                      </button>
                      <button onClick={() => act(r.id, 'send')} disabled={disabled || !priced} title={priced ? 'Send to client' : 'Set an amount first'}
                        style={{ padding: '0 8px', height: 20, borderRadius: 6, border: 'none', background: TEAL, color: '#fff', cursor: priced ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 700, fontFamily: F, opacity: (disabled || !priced) ? 0.45 : 1 }}>
                        Send
                      </button>
                      <button onClick={() => act(r.id, 'mark-retainer')} disabled={disabled} title="Covered by the monthly retainer, don't bill separately"
                        style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7B2D8E', opacity: disabled ? 0.5 : 1 }}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      </button>
                      <button onClick={() => act(r.id, 'mark-annual')} disabled={disabled} title="Covered by the yearly billing, don't bill separately"
                        style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B45309', opacity: disabled ? 0.5 : 1 }}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0V11.25A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6 2 2 3.5-3.5" /></svg>
                      </button>
                      <button onClick={() => setConfirmDel(r)} disabled={disabled} title="Delete"
                        style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    </div>
            )
          } },
        ]}
      />
       </>
      )}

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
