'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { usePhone } from '@/hooks/useMediaQuery'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:             { label: 'Draft',          color: '#5C5C5C', bg: '#F1F5F9' },
  SENT:              { label: 'Sent',           color: '#1E40AF', bg: '#DBEAFE' },
  OVERDUE:           { label: 'Overdue',        color: '#991B1B', bg: '#FEE2E2' },
  PARTIALLY_PAID:    { label: 'Partially Paid', color: '#92400E', bg: '#FEF3C7' },
  PAID:              { label: 'Paid',           color: '#166534', bg: '#DCFCE7' },
  RETAINER_INCLUDED: { label: 'In Retainer',    color: '#5B21B6', bg: '#EDE9FE' },
  CANCELLED:         { label: 'Cancelled',      color: '#991B1B', bg: '#FEE2E2' },
}

const PAYMENT_METHODS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'CHEQUE',        label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'ONLINE',        label: 'Online' },
  { value: 'OTHER',         label: 'Other' },
]
const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]))

const money   = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Loads an image and returns it as a data URL with its pixel size, for jsPDF.
function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      resolve({ dataUrl: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = reject
    img.src = url
  })
}

// Due date, defaulting to a week after the issue date when none is stored, so an
// invoice always shows one. It stays editable in Invoice Approval.
const dueOf = (i: any): string | null => {
  if (i.dueDate) return i.dueDate
  if (!i.issueDate) return null
  const d = new Date(i.issueDate)
  d.setDate(d.getDate() + 7)
  return d.toISOString()
}

// What's still owed. Cash isn't the only thing that closes an invoice. A discount or
// tax the client withheld at source settles it just the same.
const balanceOf = (i: any) =>
  Number(i.amount) - Number(i.amountPaid ?? 0) - Number(i.discountTotal ?? 0)
  - Number(i.incomeTaxWithheld ?? 0) - Number(i.salesTaxWithheld ?? 0)

const iso = (d: Date) => d.toISOString().split('T')[0]

// Date-range presets for the ledger. `null` means unbounded, the account from day one.
type RangeKey = 'month' | 'year' | 'all' | 'custom'
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month',  label: 'This Month' },
  { key: 'year',   label: 'This Year' },
  { key: 'all',    label: 'All Time' },
  { key: 'custom', label: 'Custom' },
]
function rangeBounds(key: RangeKey): { from?: string; to?: string } {
  const now = new Date()
  if (key === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),  to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (key === 'year')  return { from: iso(new Date(now.getFullYear(), 0, 1)),               to: iso(new Date(now.getFullYear(), 11, 31)) }
  return {}
}

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

type Invoice = any

// ─── Stat card (same design as Attendance Approval) ───────────────────────────
function StatCard({ label, value, border, fill }: { label: string; value: string | number; border: string; fill: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827', fontFamily: '"Aptos", sans-serif' }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// ─── Receive Payment (QuickBooks-style) ───────────────────────────────────────
// Renders inline in the right pane, like the Attendance Report calendar, not as an overlay.
type Adj = { amount: string; discount: string; incomeTaxWithheld: string; salesTaxWithheld: string }
const blankAdj = (): Adj => ({ amount: '', discount: '', incomeTaxWithheld: '', salesTaxWithheld: '' })
const adjNum   = (a: Adj | undefined, k: keyof Adj) => Number(a?.[k]) || 0
const adjTotal = (a: Adj | undefined) => adjNum(a, 'amount') + adjNum(a, 'discount') + adjNum(a, 'incomeTaxWithheld') + adjNum(a, 'salesTaxWithheld')

function ReceivePaymentPanel({ client, onClose, onSaved }: { client: any; onClose: () => void; onSaved: () => void }) {
  const [open,      setOpen]      = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [received,  setReceived]  = useState('')
  const [alloc,     setAlloc]     = useState<Record<string, Adj>>({})
  // Which invoices this payment is being put against, QuickBooks style. All are
  // ticked on load so the default stays "settle the oldest first".
  const [selected,  setSelected]  = useState<Record<string, boolean>>({})
  const [method,    setMethod]    = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [paidAt,    setPaidAt]    = useState(new Date().toISOString().split('T')[0])
  const [notes,     setNotes]     = useState('')
  const [proofUrl,  setProofUrl]  = useState('')
  const [proofName, setProofName] = useState('')
  const [overType,  setOverType]  = useState<'ADVANCE' | 'BONUS'>('ADVANCE')
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    api.get(`/invoices/open/${client.id}`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.data ?? []
        setOpen(list)
        setSelected(Object.fromEntries(list.map((i: any) => [i.id, true])))
      })
      .catch(() => setOpen([]))
      .finally(() => setLoading(false))
  }, [client.id])

  const totalOpen     = open.reduce((s, i) => s + Number(i.balance), 0)
  const totalApplied  = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'amount'), 0)
  const totalDiscount = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'discount'), 0)
  const totalItw      = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'incomeTaxWithheld'), 0)
  const totalStw      = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'salesTaxWithheld'), 0)
  const totalSettled  = totalApplied + totalDiscount + totalItw + totalStw
  const amountRecv    = Number(received) || 0
  const unapplied     = amountRecv - totalApplied

  // Spread the cash across the oldest ticked invoices first, like QuickBooks does.
  // Any discount/withholding already typed on a row reduces what cash that row
  // still needs. Unticked rows are cleared so they contribute nothing.
  function autoApply(amountStr: string, sel: Record<string, boolean> = selected) {
    setReceived(amountStr)
    let left = Number(amountStr) || 0
    setAlloc(prev => {
      const next: Record<string, Adj> = {}
      for (const inv of open) {
        if (!sel[inv.id]) { next[inv.id] = blankAdj(); continue }
        const row     = prev[inv.id] ?? blankAdj()
        const nonCash = adjNum(row, 'discount') + adjNum(row, 'incomeTaxWithheld') + adjNum(row, 'salesTaxWithheld')
        const needs   = Math.max(0, Number(inv.balance) - nonCash)
        const take    = Math.min(Math.max(0, left), needs)
        next[inv.id]  = { ...row, amount: take > 0 ? String(take) : '' }
        left -= take
      }
      return next
    })
  }

  // Re-spreading after every tick keeps the cash landing on whatever is still
  // selected, instead of stranding it on a row the user just excluded.
  function toggleRow(id: string) {
    const nextSel = { ...selected, [id]: !selected[id] }
    setSelected(nextSel)
    autoApply(received, nextSel)
  }

  function toggleAll() {
    const allOn   = open.length > 0 && open.every(i => selected[i.id])
    const nextSel = Object.fromEntries(open.map(i => [i.id, !allOn]))
    setSelected(nextSel)
    autoApply(received, nextSel)
  }

  function setField(id: string, key: keyof Adj, value: string) {
    setAlloc(p => ({ ...p, [id]: { ...(p[id] ?? blankAdj()), [key]: value } }))
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/sales-tax-tasks/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setProofUrl(res.data?.data?.url ?? res.data?.url)
      setProofName(file.name)
    } catch { setError('Upload failed') }
    finally { setUploading(false) }
  }

  async function save() {
    if (amountRecv <= 0) { setError('Enter the amount received'); return }
    if (unapplied < -0.001) { setError('Amount applied to invoices is more than the payment received'); return }

    // Allocations are optional. A payment with none is an advance, and the whole
    // amount sits as credit until there's an invoice to put it against. A row counts
    // even with no cash on it, since a discount alone can settle an invoice.
    const allocations = Object.entries(alloc)
      .map(([invoiceId, a]) => ({
        invoiceId,
        amount:            adjNum(a, 'amount'),
        discount:          adjNum(a, 'discount'),
        incomeTaxWithheld: adjNum(a, 'incomeTaxWithheld'),
        salesTaxWithheld:  adjNum(a, 'salesTaxWithheld'),
      }))
      .filter(a => a.amount + a.discount + a.incomeTaxWithheld + a.salesTaxWithheld > 0)

    setSaving(true); setError('')
    try {
      await api.post('/invoices/receive-payment', {
        clientId: client.id, amount: amountRecv, method,
        reference: reference || undefined, proofUrl: proofUrl || undefined,
        paidAt: paidAt || undefined, notes: notes || undefined,
        overpaymentType: unapplied > 0.001 ? overType : undefined,
        allocations,
      })
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to record payment') }
    finally { setSaving(false) }
  }

  const cell: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, fontFamily: F, borderBottom: `1px solid ${P.border}50` }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
        {/* Header */}
        <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
              Receive Payment
            </h2>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: F }}>
              {client.businessName ?? client.fullName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14, fontFamily: F }}>{money(totalOpen)}</span>
              <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: 12, fontFamily: F }}>Open Balance</span>
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
          {/* Payment details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Amount Received <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="number" min={0} value={received} onChange={e => autoApply(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Method <span style={{ color: '#ef4444' }}>*</span></label>
              <StyledSelect value={method} onChange={setMethod} options={PAYMENT_METHODS} />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Reference</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque no. / transaction ID" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Payment Proof</label>
              {proofUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4' }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: F }}>{proofName}</span>
                  <button onClick={() => { setProofUrl(''); setProofName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 15, lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 8, border: `1px dashed ${P.border}`, cursor: 'pointer', fontSize: 12, color: '#94A3B8', background: '#FAFAFA', fontFamily: F }}>
                  {uploading ? 'Uploading…' : 'Upload receipt'}
                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleUpload} />
                </label>
              )}
            </div>
          </div>

          {/* Outstanding invoices */}
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>
            OUTSTANDING INVOICES
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12, fontFamily: F }}>Loading…</div>
          ) : open.length === 0 ? (
            <div style={{ padding: '18px 24px', textAlign: 'center', border: `1px solid ${P.border}`, borderRadius: 8, background: '#F8FAFC' }}>
              <div style={{ fontSize: 12, color: P.textMuted, fontFamily: F }}>Nothing outstanding for this client.</div>
              <div style={{ fontSize: 11.5, color: '#5B21B6', fontFamily: F, fontWeight: 700, marginTop: 4 }}>
                Recording a payment now keeps it as advance credit until an invoice is raised.
              </div>
            </div>
          ) : (
            <div style={{ border: `1px solid ${P.border}`, borderRadius: 8, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={{ ...cell, width: 34, textAlign: 'center' }}>
                      <input type="checkbox" title="Select all"
                        checked={open.length > 0 && open.every(i => selected[i.id])}
                        onChange={toggleAll}
                        style={{ accentColor: TEAL, cursor: 'pointer', width: 15, height: 15 }} />
                    </th>
                    {[
                      { h: 'Invoice',      w: undefined },
                      { h: 'Open Balance', w: 100 },
                      { h: 'Payment',      w: 96 },
                      { h: 'Discount',     w: 92 },
                      { h: 'Income Tax W/H', w: 96 },
                      { h: 'Sales Tax W/H',  w: 96 },
                      { h: 'Left',         w: 84 },
                    ].map((c, i) => (
                      <th key={c.h} style={{ ...cell, width: c.w, fontWeight: 900, fontSize: 9.5, letterSpacing: '0.06em', color: '#64748B', textTransform: 'uppercase', textAlign: i >= 1 ? 'center' : 'left' }}>{c.h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {open.map(inv => {
                    const row       = alloc[inv.id]
                    const settled   = adjTotal(row)
                    const remaining = Number(inv.balance) - settled
                    const on        = !!selected[inv.id]
                    const numIn: React.CSSProperties = { ...inputStyle, padding: '5px 7px', textAlign: 'right', fontSize: 12, fontWeight: 700, opacity: on ? 1 : 0.45 }
                    return (
                      <tr key={inv.id} style={{ background: on ? 'transparent' : '#FAFBFC' }}>
                        <td style={{ ...cell, textAlign: 'center' }}>
                          <input type="checkbox" checked={on} onChange={() => toggleRow(inv.id)}
                            style={{ accentColor: TEAL, cursor: 'pointer', width: 15, height: 15 }} />
                        </td>
                        <td style={{ ...cell, fontWeight: 700, color: on ? TEAL : '#94A3B8' }}>
                          {inv.invoiceNumber}
                          <div style={{ fontSize: 10.5, fontWeight: 400, color: '#94A3B8' }}>{fmtDate(inv.issueDate)}</div>
                        </td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: on ? NAVY : '#94A3B8' }}>{money(inv.balance)}</td>
                        <td style={cell}><input type="number" min={0} disabled={!on} value={row?.amount ?? ''} placeholder="0"
                          onChange={e => setField(inv.id, 'amount', e.target.value)} style={numIn} /></td>
                        <td style={cell}><input type="number" min={0} disabled={!on} value={row?.discount ?? ''} placeholder="0"
                          onChange={e => setField(inv.id, 'discount', e.target.value)} style={numIn} /></td>
                        <td style={cell}><input type="number" min={0} disabled={!on} value={row?.incomeTaxWithheld ?? ''} placeholder="0"
                          onChange={e => setField(inv.id, 'incomeTaxWithheld', e.target.value)} style={numIn} /></td>
                        <td style={cell}><input type="number" min={0} disabled={!on} value={row?.salesTaxWithheld ?? ''} placeholder="0"
                          onChange={e => setField(inv.id, 'salesTaxWithheld', e.target.value)} style={numIn} /></td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 800, color: !on ? '#94A3B8' : Math.abs(remaining) < 0.01 ? '#16a34a' : remaining < 0 ? '#D62828' : '#64748B' }}>
                          {money(remaining)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {open.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: F }}>
              Discount and withheld tax close the invoice without cash. Get <strong>Left</strong> to 0 and it's marked Paid.
            </p>
          )}

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <div style={{ width: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontFamily: F }}>
                <span style={{ color: '#64748B' }}>Amount received</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{money(amountRecv)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontFamily: F }}>
                <span style={{ color: '#64748B' }}>Amount applied</span>
                <span style={{ fontWeight: 700, color: '#16a34a' }}>{money(totalApplied)}</span>
              </div>
              {totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontFamily: F }}>
                  <span style={{ color: '#64748B' }}>Discount allowed</span>
                  <span style={{ fontWeight: 700, color: '#D97706' }}>{money(totalDiscount)}</span>
                </div>
              )}
              {(totalItw > 0 || totalStw > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontFamily: F }}>
                  <span style={{ color: '#64748B' }}>Withheld at source</span>
                  <span style={{ fontWeight: 700, color: '#D97706' }}>{money(totalItw + totalStw)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, fontFamily: F, borderTop: `1px solid ${P.border}`, borderBottom: `1px solid ${P.border}` }}>
                <span style={{ fontWeight: 700, color: NAVY }}>Invoices settled</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{money(totalSettled)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', fontSize: 13, fontFamily: F }}>
                <span style={{ fontWeight: 700, color: NAVY }}>Unapplied amount</span>
                <span style={{ fontWeight: 700, color: unapplied < -0.001 ? '#D62828' : unapplied > 0.001 ? '#5B21B6' : '#16a34a' }}>{money(unapplied)}</span>
              </div>
              {unapplied < -0.001 && (
                <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, color: '#D62828', fontFamily: F, textAlign: 'right' }}>
                  More amount applied than was received
                </p>
              )}
            </div>
          </div>

          {/* What happens to money beyond what it was applied to */}
          {unapplied > 0.001 && (
            <div style={{ marginTop: 14, border: `1px solid ${P.border}`, borderRadius: 8, padding: '9px 11px', background: '#F8FAFC', fontFamily: F }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: F, marginBottom: 6 }}>
                {money(unapplied)} more than the invoices needed. What is it?
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  { k: 'ADVANCE', t: 'Advance', d: 'Credit on their account, shows as a negative balance until applied to a future invoice' },
                  { k: 'BONUS',   t: 'Bonus',   d: 'Client meant us to keep it, counts as income and not credit they can draw on' },
                ] as const).map(o => (
                  <label key={o.k} style={{ flex: 1, minWidth: 180, display: 'flex', gap: 7, alignItems: 'flex-start', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: '#fff', border: `1.5px solid ${overType === o.k ? TEAL : P.border}` }}>
                    <input type="radio" checked={overType === o.k} onChange={() => setOverType(o.k)}
                      style={{ accentColor: TEAL, marginTop: 1, cursor: 'pointer' }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: overType === o.k ? TEAL : NAVY, fontFamily: F }}>{o.t}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', fontFamily: F, marginTop: 1, lineHeight: 1.35 }}>{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
            <button onClick={save} disabled={saving || uploading || amountRecv <= 0 || unapplied < -0.001}
              style={{ ...btn('#16a34a'), opacity: (saving || uploading || amountRecv <= 0 || unapplied < -0.001) ? 0.6 : 1 }}>
              {saving ? 'Saving…' : `Record ${money(amountRecv)}`}
            </button>
          </div>
        </div>
    </div>
  )
}

// ─── Apply an advance payment's leftover credit to invoices ───────────────────
function ApplyCreditPanel({ payment, onClose, onSaved }: { payment: any; onClose: () => void; onSaved: () => void }) {
  const [open,    setOpen]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [alloc,   setAlloc]   = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    api.get(`/invoices/open/${payment.clientId}`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.data ?? []
        setOpen(list)
        // Pre-fill oldest-first with whatever credit is left, same as Receive Payment
        let left = Number(payment.unapplied)
        const next: Record<string, string> = {}
        for (const inv of list) {
          if (left <= 0) break
          const take = Math.min(left, Number(inv.balance))
          next[inv.id] = String(take)
          left -= take
        }
        setAlloc(next)
      })
      .catch(() => setOpen([]))
      .finally(() => setLoading(false))
  }, [payment.clientId, payment.unapplied])

  const totalApplied = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0)
  const remaining    = Number(payment.unapplied) - totalApplied

  async function save() {
    const allocations = Object.entries(alloc)
      .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) || 0 }))
      .filter(a => a.amount > 0)
    if (allocations.length === 0) { setError('Apply the credit to at least one invoice'); return }

    setSaving(true); setError('')
    try {
      await api.post(`/invoices/payments/${payment.id}/apply`, { allocations })
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to apply credit') }
    finally { setSaving(false) }
  }

  const cell: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, fontFamily: F, borderBottom: `1px solid ${P.border}50` }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
      <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
            Apply Advance
          </h2>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: F }}>
            {fmtDate(payment.paidAt)} · {METHOD_LABEL[payment.method] ?? payment.method}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14, fontFamily: F }}>{money(payment.unapplied)}</span>
            <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: 12, fontFamily: F }}>Available Credit</span>
          </span>
          <button onClick={onClose} style={{ cursor: 'pointer', color: '#E2E8F0', fontWeight: 700, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontFamily: F }}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>OUTSTANDING INVOICES</div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>Loading…</div>
        ) : open.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12, border: `1px solid ${P.border}`, borderRadius: 8 }}>
            No outstanding invoices yet. This credit stays on the account until one is raised.
          </div>
        ) : (
          <div style={{ border: `1px solid ${P.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Invoice', 'Date', 'Open Balance', 'Apply'].map((h, i) => (
                    <th key={h} style={{ ...cell, fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', color: '#64748B', textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {open.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ ...cell, fontWeight: 700, color: TEAL }}>{inv.invoiceNumber}</td>
                    <td style={{ ...cell, color: '#64748B' }}>{fmtDate(inv.issueDate)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: NAVY }}>{money(inv.balance)}</td>
                    <td style={{ ...cell, textAlign: 'right', width: 120 }}>
                      <input type="number" min={0} max={inv.balance} value={alloc[inv.id] ?? ''}
                        onChange={e => setAlloc(p => ({ ...p, [inv.id]: e.target.value }))} placeholder="0"
                        style={{ ...inputStyle, padding: '5px 8px', textAlign: 'right', fontSize: 12.5, fontWeight: 700 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <div style={{ width: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Available credit</span>
              <span style={{ fontWeight: 700, color: NAVY }}>{money(payment.unapplied)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: `1px solid ${P.border}` }}>
              <span style={{ color: '#64748B' }}>Applying now</span>
              <span style={{ fontWeight: 700, color: '#16a34a' }}>{money(totalApplied)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', fontSize: 13 }}>
              <span style={{ fontWeight: 900, color: NAVY }}>Credit left</span>
              <span style={{ fontWeight: 900, color: remaining < -0.001 ? '#D62828' : '#5B21B6' }}>{money(remaining)}</span>
            </div>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving || totalApplied <= 0 || remaining < -0.001}
            style={{ ...btn('#16a34a'), opacity: (saving || totalApplied <= 0 || remaining < -0.001) ? 0.6 : 1 }}>
            {saving ? 'Applying…' : `Apply ${money(totalApplied)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice view / print ─────────────────────────────────────────────────────
// Create a manual invoice, or edit an existing one. clientId is required for
// create; when `inv` is passed it edits that invoice instead.
function InvoiceFormModal({ clientId, clientName, inv, onClose, onSaved }: {
  clientId: string; clientName: string; inv?: Invoice | null; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!inv
  const [description, setDescription] = useState(inv?.description ?? '')
  const [subtotal,    setSubtotal]    = useState(inv?.subtotal    != null ? String(Number(inv.subtotal))    : '')
  const [salesTax,    setSalesTax]    = useState(inv?.salesTax    != null ? String(Number(inv.salesTax))    : '')
  const [outOfPocket, setOutOfPocket] = useState(inv?.outOfPocket != null ? String(Number(inv.outOfPocket)) : '')
  const [dueDate,     setDueDate]     = useState(() => {
    if (inv?.dueDate) return inv.dueDate.split('T')[0]
    const d = new Date(inv?.issueDate ?? Date.now()); d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
  const [notes,  setNotes]  = useState(inv?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const nSub = Number(subtotal) || 0, nTax = Number(salesTax) || 0, nOop = Number(outOfPocket) || 0
  const total = nSub + nTax + nOop

  async function save() {
    if (!isEdit && total <= 0) { setError('Enter an amount for the invoice'); return }
    if (!description.trim())   { setError('Add a description'); return }
    setSaving(true); setError('')
    try {
      const body = { subtotal: nSub, salesTax: nTax, outOfPocket: nOop, description: description.trim(), dueDate: dueDate || undefined, notes: notes.trim() || undefined }
      if (isEdit) {
        await api.patch(`/invoices/${inv!.id}`, body)
      } else {
        // New manual invoices are sent straight away so they land in the client's
        // ledger and can be paid, rather than sitting as a hidden draft.
        const { data } = await api.post('/invoices', { clientId, ...body })
        const created = data?.data ?? data
        await api.post(`/invoices/${created.id}/send`)
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not save the invoice')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 470, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ background: '#7EC8D0', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 14, fontWeight: 300, letterSpacing: '0.04em', color: NAVY, margin: 0 }}>
            {isEdit ? `Edit ${inv!.invoiceNumber}` : 'New Invoice'}
          </h2>
          <span style={{ fontSize: 12, color: NAVY, fontWeight: 700, fontFamily: F }}>{clientName}</span>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is being billed" style={inputStyle} autoFocus />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Professional Fee</label>
            <input type="number" min={0} value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="0" style={inputStyle} />
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
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 12px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create & Send'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvoiceView({ inv, onClose, onDeleted, onEdit }: { inv: Invoice; onClose: () => void; onDeleted?: () => void; onEdit?: (inv: Invoice) => void }) {
  const balance = balanceOf(inv)
  const st = STATUS_META[inv.status] ?? STATUS_META.DRAFT
  const clientName = inv.client?.businessName ?? inv.client?.user?.fullName ?? 'Client'
  const [busy, setBusy] = useState(false)
  // Two-step delete: the first click arms it, the second confirms.
  const [confirmDel, setConfirmDel] = useState(false)
  const [delBusy,    setDelBusy]    = useState(false)
  const [delError,   setDelError]   = useState('')

  async function handleDelete() {
    setDelBusy(true); setDelError('')
    try {
      await api.delete(`/invoices/${inv.id}`)
      onDeleted?.()
    } catch (e: any) {
      setDelError(e?.response?.data?.message ?? 'Could not delete this invoice.')
      setConfirmDel(false)
    } finally {
      setDelBusy(false)
    }
  }

  // Drawn natively with jsPDF, coordinate by coordinate, so margins are exactly
  // equal, the status pill is truly centred, and nothing depends on a screenshot.
  async function handleSavePdf() {
    setBusy(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = 210, pageH = 297, margin = 14
      const left = margin, right = pageW - margin, contentW = pageW - margin * 2

      const NAVY: [number, number, number]  = [19, 46, 87]
      const GREY: [number, number, number]  = [100, 116, 139]
      const MUTED: [number, number, number] = [148, 163, 184]
      const GREEN: [number, number, number] = [22, 163, 74]
      const RED: [number, number, number]   = [214, 40, 40]

      // ── Header band ──
      const headerH = 30
      pdf.setFillColor(233, 237, 243)
      pdf.roundedRect(left, margin, contentW, headerH, 4, 4, 'F')
      try {
        const logo = await loadImage('/logo-email.png')
        const logoH = 17, logoW = logoH * (logo.w / logo.h)
        pdf.addImage(logo.dataUrl, 'PNG', left + 8, margin + (headerH - logoH) / 2, logoW, logoH)
      } catch { /* logo optional */ }
      pdf.setTextColor(...NAVY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22)
      pdf.text('INVOICE', right - 8, margin + 15, { align: 'right' })
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GREY)
      pdf.text(inv.invoiceNumber, right - 8, margin + 22, { align: 'right' })

      // ── Bill To (left) ──
      let y = margin + headerH + 12
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
      pdf.text('BILL TO', left, y)
      pdf.setFontSize(13); pdf.setTextColor(...NAVY)
      pdf.text(clientName, left, y + 6)
      let ly = y + 11
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...GREY)
      if (inv.client?.ntn)     { pdf.text(`NTN: ${inv.client.ntn}`, left, ly);   ly += 4.5 }
      if (inv.client?.strn)    { pdf.text(`STRN: ${inv.client.strn}`, left, ly); ly += 4.5 }
      if (inv.client?.address) {
        const lines = pdf.splitTextToSize(String(inv.client.address), contentW / 2 - 4)
        pdf.text(lines, left, ly); ly += lines.length * 4.5
      }

      // ── Dates + status (right) ──
      const rLabelX = right - 58
      let dy = y
      const dateRow = (label: string, val: string) => {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
        pdf.text(label, rLabelX, dy)
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY)
        pdf.text(val, right, dy, { align: 'right' })
        dy += 7
      }
      dateRow('Issue Date', fmtDate(inv.issueDate))
      dateRow('Due Date', fmtDate(dueOf(inv)))
      // Status pill, drawn and centred by hand.
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
      pdf.text('Status', rLabelX, dy)
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9)
      const pillTxt = st.label
      const pw = pdf.getTextWidth(pillTxt) + 8, ph = 6.2
      const px = right - pw, py = dy - 4.4
      pdf.setFillColor(...hexToRgb(st.bg)); pdf.roundedRect(px, py, pw, ph, 3, 3, 'F')
      pdf.setTextColor(...hexToRgb(st.color))
      pdf.text(pillTxt, px + pw / 2, py + ph / 2, { align: 'center', baseline: 'middle' })
      dy += 7

      y = Math.max(ly, dy) + 4
      pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.3); pdf.line(left, y, right, y)
      y += 9

      // ── Line item header + row ──
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...NAVY)
      pdf.text('DESCRIPTION', left, y)
      pdf.text('AMOUNT (PKR)', right, y, { align: 'right' })
      y += 2.5; pdf.setDrawColor(...NAVY); pdf.setLineWidth(0.5); pdf.line(left, y, right, y); y += 7
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85)
      pdf.text(inv.description ?? 'Professional services', left, y)
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY)
      pdf.text(money(inv.amount), right, y, { align: 'right' })
      y += 12

      // ── Totals (right column) ──
      const tLabelX = right - 62
      const totRow = (label: string, val: string, o: { bold?: boolean; green?: boolean; big?: boolean } = {}) => {
        pdf.setFont('helvetica', o.bold ? 'bold' : 'normal'); pdf.setFontSize(o.big ? 11 : 9.5)
        pdf.setTextColor(...(o.green ? GREEN : o.bold ? NAVY : GREY))
        pdf.text(label, tLabelX, y)
        pdf.setTextColor(...(o.green ? GREEN : NAVY))
        pdf.text(val, right, y, { align: 'right' })
        y += 6.5
      }
      totRow('Professional Fee', money(inv.subtotal))
      if (Number(inv.salesTax) > 0)    totRow('Sales Tax', money(inv.salesTax))
      if (Number(inv.outOfPocket) > 0) totRow('Out of Pocket', money(inv.outOfPocket))
      pdf.setDrawColor(226, 232, 240); pdf.line(tLabelX, y - 2.5, right, y - 2.5)
      totRow('Total', money(inv.amount), { bold: true })
      if (Number(inv.amountPaid) > 0)         totRow('Paid', `- ${money(inv.amountPaid)}`, { green: true })
      if (Number(inv.discountTotal) > 0)      totRow('Discount', `- ${money(inv.discountTotal)}`, { green: true })
      if (Number(inv.incomeTaxWithheld) > 0)  totRow('Income Tax Withheld', `- ${money(inv.incomeTaxWithheld)}`, { green: true })
      if (Number(inv.salesTaxWithheld) > 0)   totRow('Sales Tax Withheld', `- ${money(inv.salesTaxWithheld)}`, { green: true })
      pdf.setDrawColor(226, 232, 240); pdf.line(tLabelX, y - 1.5, right, y - 1.5); y += 2.5
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...NAVY)
      pdf.text('Balance Due', tLabelX, y)
      pdf.setTextColor(...(balance > 0 ? RED : GREEN))
      pdf.text(`PKR ${money(balance)}`, right, y, { align: 'right' })
      y += 12

      // ── Payments received ──
      const allocs = inv.allocations ?? []
      if (allocs.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
        pdf.text('PAYMENTS RECEIVED', left, y); y += 6
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
        for (const a of allocs) {
          pdf.setTextColor(...GREY)
          pdf.text(fmtDate(a.payment?.paidAt), left, y)
          pdf.text(METHOD_LABEL[a.payment?.method] ?? a.payment?.method ?? '', left + 42, y)
          pdf.setTextColor(...GREEN); pdf.text(money(a.amount), right, y, { align: 'right' })
          y += 5.5
        }
        y += 4
      }

      // ── Blank plate filling the rest of the page down to the bottom margin ──
      const boxTop = y + 4
      const boxBottom = pageH - margin
      if (boxBottom - boxTop > 18) {
        pdf.setDrawColor(203, 213, 225); pdf.setFillColor(248, 250, 252); pdf.setLineWidth(0.3)
        pdf.setLineDashPattern([1, 1], 0)
        pdf.roundedRect(left, boxTop, contentW, boxBottom - boxTop, 3, 3, 'FD')
        pdf.setLineDashPattern([], 0)
        pdf.setTextColor(...MUTED); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
        pdf.text('This area is intentionally left blank', pageW / 2, (boxTop + boxBottom) / 2, { align: 'center', baseline: 'middle' })
      }

      pdf.save(`${clientName} ${inv.invoiceNumber}.pdf`.replace(/[\\/:*?"<>|]/g, '-'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 780 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {confirmDel ? (
            // Second step: the actual confirmation.
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '6px 8px 6px 14px', marginRight: 'auto' }}>
              <span style={{ fontSize: 13, color: '#B91C1C', fontWeight: 600, fontFamily: F }}>Permanently delete this invoice?</span>
              <button onClick={handleDelete} disabled={delBusy} style={{ ...btn('#DC2626'), opacity: delBusy ? 0.6 : 1 }}>{delBusy ? 'Deleting…' : 'Yes, delete'}</button>
              <button onClick={() => setConfirmDel(false)} disabled={delBusy} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Keep it</button>
            </div>
          ) : (
            <button onClick={() => { setDelError(''); setConfirmDel(true) }} style={{ ...btn('#fff', '#B91C1C'), border: '1px solid #FCA5A5', marginRight: 'auto' }}>Delete</button>
          )}
          {delError && <span style={{ fontSize: 12, color: '#B91C1C', marginRight: 'auto', fontFamily: F }}>{delError}</span>}
          {onEdit && <button onClick={() => onEdit(inv)} style={{ ...btn('#fff', NAVY), border: `1px solid ${P.border}` }}>Edit</button>}
          <button onClick={handleSavePdf} disabled={busy} style={{ ...btn(NAVY), opacity: busy ? 0.6 : 1 }}>{busy ? 'Preparing…' : 'Download PDF'}</button>
          <button onClick={onClose} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Close</button>
        </div>

        <div id="invoice-print" style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', padding: 16 }}>
          {/* Soft grey header band, like the profile section headers, as a rounded plate. */}
          <div style={{ background: 'linear-gradient(90deg, #E4E9F0, #EDF0F5)', color: NAVY, padding: '18px 28px', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <img src="/logo-email.png" alt="Asif Associates" style={{ height: 68, display: 'block' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '0.1em', fontFamily: F, color: NAVY }}>INVOICE</div>
              <div style={{ fontSize: 12, marginTop: 3, fontFamily: F, color: '#64748B' }}>{inv.invoiceNumber}</div>
            </div>
          </div>

          <div style={{ padding: '24px 36px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderBottom: `1px solid ${P.border}` }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: '#94A3B8', fontFamily: F, marginBottom: 6 }}>BILL TO</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, fontFamily: F }}>{inv.client?.businessName ?? inv.client?.user?.fullName}</div>
              {inv.client?.ntn     && <div style={{ fontSize: 12, color: '#64748B', fontFamily: F, marginTop: 3 }}>NTN: {inv.client.ntn}</div>}
              {inv.client?.strn    && <div style={{ fontSize: 12, color: '#64748B', fontFamily: F }}>STRN: {inv.client.strn}</div>}
              {inv.client?.address && <div style={{ fontSize: 12, color: '#64748B', fontFamily: F, marginTop: 3 }}>{inv.client.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5, textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F }}>
                  <span style={{ color: '#94A3B8', minWidth: 74 }}>Issue Date</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{fmtDate(inv.issueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F }}>
                  <span style={{ color: '#94A3B8', minWidth: 74 }}>Due Date</span>
                  {/* Falls back to a week after the issue date when none was set. */}
                  <span style={{ fontWeight: 700, color: NAVY }}>{fmtDate(dueOf(inv))}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F, alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8', minWidth: 74 }}>Status</span>
                  {/* inline-flex + lineHeight keeps the label centred in the pill,
                      which the flat span did not do when captured to the PDF. */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, padding: '3px 12px', borderRadius: 20, fontSize: 11, lineHeight: 1, color: st.color, background: st.bg }}>{st.label}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '24px 36px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${NAVY}` }}>
                  <th style={{ textAlign: 'left', padding: '0 0 8px', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: NAVY }}>DESCRIPTION</th>
                  <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: NAVY, width: 160 }}>AMOUNT (PKR)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${P.border}` }}>
                  <td style={{ padding: '14px 0', fontSize: 13, color: '#334155' }}>
                    {inv.description ?? 'Professional services'}
                    {inv.notes && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{inv.notes}</div>}
                  </td>
                  <td style={{ padding: '14px 0', fontSize: 13, fontWeight: 700, color: NAVY, textAlign: 'right' }}>{money(inv.amount)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <div style={{ width: 280 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                  <span style={{ color: '#64748B' }}>Professional Fee</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{money(inv.subtotal)}</span>
                </div>
                {Number(inv.salesTax) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                    <span style={{ color: '#64748B' }}>Sales Tax</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{money(inv.salesTax)}</span>
                  </div>
                )}
                {Number(inv.outOfPocket) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                    <span style={{ color: '#64748B' }}>Out of Pocket</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{money(inv.outOfPocket)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13, fontFamily: F, borderTop: `1px solid ${P.border}` }}>
                  <span style={{ fontWeight: 800, color: NAVY }}>Total</span>
                  <span style={{ fontWeight: 800, color: NAVY }}>{money(inv.amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                  <span style={{ color: '#64748B' }}>Paid</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>− {money(inv.amountPaid)}</span>
                </div>
                {Number(inv.discountTotal) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                    <span style={{ color: '#64748B' }}>Discount</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>− {money(inv.discountTotal)}</span>
                  </div>
                )}
                {Number(inv.incomeTaxWithheld) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                    <span style={{ color: '#64748B' }}>Income Tax Withheld</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>− {money(inv.incomeTaxWithheld)}</span>
                  </div>
                )}
                {Number(inv.salesTaxWithheld) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                    <span style={{ color: '#64748B' }}>Sales Tax Withheld</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>− {money(inv.salesTaxWithheld)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 15, fontFamily: F, borderTop: `1px solid ${P.border}`, marginTop: 5 }}>
                  <span style={{ fontWeight: 900, color: NAVY }}>Balance Due</span>
                  <span style={{ fontWeight: 900, color: balance > 0 ? '#D62828' : '#16a34a' }}>PKR {money(balance)}</span>
                </div>
              </div>
            </div>

            {/* What was put against this invoice, the allocated slice, not the whole payment */}
            {(inv.allocations ?? []).length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>PAYMENTS RECEIVED</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
                  <tbody>
                    {inv.allocations.map((a: any) => (
                      <tr key={a.id} style={{ borderBottom: `1px solid ${P.gridLine}` }}>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#64748B' }}>{fmtDate(a.payment?.paidAt)}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#64748B' }}>{METHOD_LABEL[a.payment?.method] ?? a.payment?.method}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#94A3B8' }}>{a.payment?.reference ?? ''}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>{money(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Opening balance ──────────────────────────────────────────────────────────
function OpeningBalanceModal({ client, mode, onClose, onSaved }: { client: any; mode: 'add' | 'edit'; onClose: () => void; onSaved: () => void }) {
  const [value,  setValue]  = useState(mode === 'edit' ? String(Number(client.openingBalance ?? 0)) : '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      await api.patch(`/invoices/opening-balance/${client.id}`, { openingBalance: Number(value) || 0 })
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: F }}>
          {mode === 'add' ? 'Add Opening Balance' : 'Edit Opening Balance'}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: P.textMuted, fontFamily: F }}>
          What {client.businessName ?? client.fullName} already owed before their account was set up here.
        </p>
        <label style={labelStyle}>Amount (PKR)</label>
        <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0" style={inputStyle} autoFocus />
        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InvoicingPage() {
  const phone = usePhone()
  const [clients,     setClients]     = useState<any[]>([])
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [ledger,      setLedger]      = useState<any>(null)
  const [searchInput,   setSearchInput]   = useState('')
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState<'history' | 'invoices' | 'payments'>('history')
  const [listCollapsed, setListCollapsed] = useState(false)

  const [range,      setRange]      = useState<RangeKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const [viewInv,    setViewInv]    = useState<Invoice | null>(null)
  const [editInv,    setEditInv]    = useState<Invoice | null>(null)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [payClient,  setPayClient]  = useState<any>(null)
  const [applyPay,   setApplyPay]   = useState<any>(null)
  const [openBal,    setOpenBal]    = useState<{ client: any; mode: 'add' | 'edit' } | null>(null)
  const [ctxMenu,    setCtxMenu]    = useState<{ x: number; y: number; client: any } | null>(null)

  // A custom range only applies once both ends are picked, so the ledger doesn't
  // blank out while the user is halfway through choosing.
  const bounds = useMemo(() => {
    if (range !== 'custom') return rangeBounds(range)
    return customFrom && customTo ? { from: customFrom, to: customTo } : {}
  }, [range, customFrom, customTo])

  const fetchClients = useCallback(() => {
    api.get('/invoices/clients', { params: searchInput ? { search: searchInput } : undefined })
      .then(({ data }) => setClients(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => setClients([]))
  }, [searchInput])

  const fetchRight = useCallback((silent = false) => {
    if (!selectedId) { setLedger(null); setLoading(false); return }
    if (!silent) setLoading(true)
    api.get(`/invoices/ledger/${selectedId}`, { params: bounds })
      .then(({ data }) => setLedger(data?.data ?? data))
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false) })
  }, [selectedId, bounds])

  // Dismiss the right-click menu on any click elsewhere
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', close, true) }
  }, [ctxMenu])

  useEffect(() => { fetchClients() }, [fetchClients])
  useEffect(() => { fetchRight() }, [fetchRight])
  useAutoRefresh(() => { fetchClients(); fetchRight(true) })

  function refresh() { fetchClients(); fetchRight() }

  // A payment can always be removed. Deleting it takes its cash, discount and any
  // tax withheld with it, and reopens the invoices it had settled, so an invoice
  // that was blocked from deletion can then be deleted.
  const [delPayId, setDelPayId] = useState<string | null>(null)
  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm('Delete this payment? This removes the received amount along with any discount or tax withheld recorded with it, and reopens the invoices it had settled.')) return
    setDelPayId(paymentId)
    try {
      await api.delete(`/invoices/payments/${paymentId}`)
      refresh()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Could not delete this payment.')
    } finally {
      setDelPayId(null)
    }
  }

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedId), [clients, selectedId])

  const td: React.CSSProperties = {
    padding: '6px 12px', borderBottom: `1px solid ${P.border}50`, fontFamily: F,
    fontSize: 13, fontWeight: 700, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  const th: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap',
  }

  // Issued invoices only. Pricing, sending and deleting all live in Invoice Approval
  function actions(r: Invoice) {
    return (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button onClick={() => setViewInv(r)} title="View / Print"
          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: NAVY }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: P.bgMain, fontFamily: F }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left panel: clients ──
            A 280px rail beside the account leaves nothing usable on a phone, so
            there the list and the account take turns: list is the screen until
            you pick a client, then the account is, and the header chevron walks
            back. listCollapsed doubles as that master/detail switch. */}
        <div style={{
          width: phone ? (listCollapsed ? 0 : '100%') : (listCollapsed ? 0 : 280),
          flexShrink: 0,
          display: phone && listCollapsed ? 'none' : 'flex',
          flexDirection: 'column',
          background: '#EDF0F3',
          borderRight: phone ? 'none' : `1px solid ${P.border}`,
          overflow: 'hidden',
          transition: phone ? 'none' : 'width .25s',
        }}>

          <div style={{ flexShrink: 0, borderBottom: `1px solid ${P.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: phone ? '0 14px 0 58px' : '0 14px' }}>
              <h2 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, color: '#1E8496', display: 'inline-block' }}>Invoicing</h2>
              <button onClick={() => setListCollapsed(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6 }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: '7px 10px' }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search…"
                  style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, fontFamily: F, background: 'transparent', color: NAVY }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {clients.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>No clients found.</div>
            ) : clients.map(c => {
              const active = selectedId === c.id
              return (
                <button key={c.id} onClick={() => { setSelectedId(c.id); setTab('history'); setPayClient(null); if (phone) setListCollapsed(true) }}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, client: c }) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: `1px solid ${active ? TEAL : P.border}`, borderRadius: 8, cursor: 'pointer', marginBottom: 6, background: active ? '#E8EEF7' : '#F8FAFC', fontFamily: F, opacity: c.isActive ? 1 : 0.55 }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#EEF2F7' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: active ? TEAL : NAVY }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? TEAL : NAVY, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.businessName ?? c.fullName}
                    </span>
                    {c.overdueCount > 0 && (
                      <span title={`${c.overdueCount} overdue`} style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 20, color: '#fff', background: '#D62828', flexShrink: 0 }}>!</span>
                    )}
                    {/* Negative means they've paid ahead, so show it as credit, not as a minus */}
                    <span title={c.outstanding < 0 ? 'In credit' : 'Outstanding'}
                      style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap',
                        color:      c.outstanding > 0 ? '#B91C1C' : c.outstanding < 0 ? '#5B21B6' : '#166534',
                        background: c.outstanding > 0 ? '#FEE2E2' : c.outstanding < 0 ? '#EDE9FE' : '#DCFCE7' }}>
                      {c.outstanding < 0 ? `${money(Math.abs(c.outstanding))} cr` : money(c.outstanding)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{
          flex: 1,
          display: phone && !listCollapsed ? 'none' : 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}>

          {/* Header */}
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, padding: '0 20px' }}>
            {listCollapsed && (
              <button onClick={() => setListCollapsed(false)} aria-label={phone ? 'Back to clients' : 'Show client list'}
                style={{ width: phone ? 32 : 28, height: phone ? 32 : 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg,${TEAL} 0%,#0E5F6E 100%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {/* On a phone this is the only route back to the list, so it
                    points the way it actually behaves. */}
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={phone ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
                </svg>
              </button>
            )}
            <h1 style={{ margin: 0, fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#1E8496' }}>
              {selectedId === null ? 'All Invoices' : (ledger?.client?.businessName ?? ledger?.client?.user?.fullName ?? 'Client Account')}
            </h1>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', minWidth: 0 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: P.textMuted, fontSize: 13, fontFamily: F }}>Loading…</div>
          ) : payClient ? (
            <ReceivePaymentPanel client={payClient} onClose={() => setPayClient(null)} onSaved={() => { setPayClient(null); refresh() }} />
          ) : applyPay ? (
            <ApplyCreditPanel payment={applyPay} onClose={() => setApplyPay(null)} onSaved={() => { setApplyPay(null); refresh() }} />
          ) : selectedId === null ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 40, color: P.border, margin: 0 }}>←</p>
                <p style={{ fontSize: 13, color: P.textMuted, fontFamily: F }}>Select a client to view their account</p>
              </div>
            </div>
          ) : ledger ? (
            /* Client ledger */
            <div>
              {/* This client's totals for the selected period */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <StatCard label="Opening Balance" value={money(ledger.openingBalance)} border="#64748B" fill="#D4DAE3" />
                <StatCard label="Invoiced"        value={money(ledger.totalInvoiced)}  border="#1565C0" fill="#BDDAF8" />
                <StatCard label="Received"        value={money(ledger.totalPaid)}      border="#16A34A" fill="#BBF0D6" />
                {ledger.unappliedCredit > 0 && (
                  <StatCard label="Advance Credit" value={money(ledger.unappliedCredit)} border="#7B2D8E" fill="#E4D4EC" />
                )}
                {ledger.totalBonus > 0 && (
                  <StatCard label="Bonus" value={money(ledger.totalBonus)} border="#16A34A" fill="#BBF0D6" />
                )}
                <StatCard label={ledger.outstanding < 0 ? 'In Credit' : 'Outstanding'}
                  value={money(Math.abs(ledger.outstanding))}
                  border={ledger.outstanding < 0 ? '#7B2D8E' : '#DC2626'}
                  fill={ledger.outstanding < 0 ? '#E4D4EC' : '#FECACA'} />
              </div>

              {/* Tabs + period filter + actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', marginBottom: 14, flexWrap: 'wrap' }}>
                {([['history', 'Account History'], ['invoices', `Invoices (${ledger.invoices.length})`], ['payments', `Payments (${ledger.payments.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} style={{
                    flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: F, whiteSpace: 'nowrap',
                    background: tab === k ? NAVY : 'transparent',
                    color: tab === k ? '#fff' : 'rgba(255,255,255,0.85)',
                  }}>{l}</button>
                ))}

                <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

                {RANGES.map(r => (
                  <button key={r.key} onClick={() => setRange(r.key)} style={{
                    flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: F, whiteSpace: 'nowrap',
                    background: range === r.key ? NAVY : 'transparent',
                    color: range === r.key ? '#fff' : 'rgba(255,255,255,0.85)',
                  }}>{r.label}</button>
                ))}

                {range === 'custom' && (
                  <>
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                      style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 11, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>to</span>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                      style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 11, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
                  </>
                )}

                <span style={{ flex: 1 }} />

                {ledger.client?.hasMonthlyRetainer && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', flexShrink: 0 }}>
                    Retainer {money(ledger.client.retainerAmount)}/mo
                  </span>
                )}

                <button onClick={() => setShowNewInvoice(true)}
                  style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 30, border: `1px solid ${TEAL}`, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: F, background: '#fff', color: TEAL }}>
                  New Invoice
                </button>
                <button onClick={() => setPayClient(selectedClient ?? ledger.client)}
                  style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: F, background: '#16a34a', color: '#fff' }}>
                  Receive Payment
                </button>
              </div>

              {tab === 'history' && (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '13%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
                      <col style={{ width: '24%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '11%' }} /><col style={{ width: 54 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F2AC18' }}>
                        {['Date', 'Type', 'Reference', 'Description'].map(l => <th key={l} style={th}>{l}</th>)}
                        {['Charge', 'Payment', 'Balance'].map(l => <th key={l} style={{ ...th, textAlign: 'right' }}>{l}</th>)}
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.timeline.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>
                          Nothing billed to this client yet. Drafts appear under the Invoices tab.
                        </td></tr>
                      ) : ledger.timeline.map((t: any, idx: number) => {
                        const meta = t.type === 'PAYMENT'
                          ? { label: 'Payment', color: '#166534', bg: '#DCFCE7' }
                          : t.type === 'DISCOUNT'
                            ? { label: 'Discount', color: '#92400E', bg: '#FEF3C7' }
                            : t.type === 'WITHHOLDING'
                              ? { label: 'Withheld', color: '#92400E', bg: '#FEF3C7' }
                              : t.type === 'OPENING'
                                ? { label: 'Opening', color: '#5C5C5C', bg: '#F1F5F9' }
                                : { label: 'Invoice', color: '#1E40AF', bg: '#DBEAFE' }
                        // Match this ledger line to a full invoice so the invoice
                        // rows can open the printable document.
                        const invMatch = ledger.invoices?.find((i: Invoice) => i.invoiceNumber === t.ref)
                        return (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                            <td style={{ ...td, fontWeight: 400, color: '#64748B' }}>{fmtDate(t.date)}</td>
                            <td style={td}>
                              <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 800, color: meta.color, background: meta.bg }}>{meta.label}</span>
                            </td>
                            <td style={{ ...td, color: TEAL }}>{t.ref}</td>
                            <td style={{ ...td, fontWeight: 400 }}>{t.description}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{t.charge ? money(t.charge) : ''}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{t.credit ? money(t.credit) : ''}</td>
                            <td style={{ ...td, textAlign: 'right', color: t.balance > 0 ? '#D62828' : '#16a34a' }}>{money(t.balance)}</td>
                            <td style={{ ...td, overflow: 'visible', textAlign: 'right' }}>
                              {invMatch && (
                                <button onClick={() => setViewInv(invMatch)} title="View / Print invoice"
                                  style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: NAVY }}>
                                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'invoices' && (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '22%' }} /><col style={{ width: '11%' }} />
                      <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: 120 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F2AC18' }}>
                        {['Invoice #', 'Date', 'Description', 'Due Date', 'Amount', 'Balance', 'Status'].map(l => <th key={l} style={th}>{l}</th>)}
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.invoices.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>No invoices for this client yet.</td></tr>
                      ) : ledger.invoices.map((r: Invoice, idx: number) => {
                        const st = STATUS_META[r.status] ?? STATUS_META.DRAFT
                        const balance = balanceOf(r)
                        return (
                          <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                            <td style={{ ...td, color: TEAL }}>{r.invoiceNumber}</td>
                            <td style={{ ...td, fontWeight: 400, color: '#64748B' }}>{fmtDate(r.issueDate)}</td>
                            <td style={{ ...td, fontWeight: 400 }}>
                              {r.description ?? ''}
                              {r.kind === 'RETAINER' && (
                                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4, background: '#EDE9FE', color: '#5B21B6' }}>RETAINER</span>
                              )}
                            </td>
                            <td style={{ ...td, fontWeight: 400, color: r.status === 'OVERDUE' ? '#D62828' : '#64748B' }}>{fmtDate(dueOf(r))}</td>
                            <td style={td}>{money(r.amount)}</td>
                            <td style={{ ...td, color: balance > 0 ? '#D62828' : '#16a34a' }}>{money(balance)}</td>
                            <td style={td}><span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: st.color, background: st.bg }}>{st.label}</span></td>
                            <td style={{ ...td, overflow: 'visible' }}>{actions(r)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'payments' && (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} />
                      <col style={{ width: '21%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: 100 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F2AC18' }}>
                        {['Date', 'Method', 'Reference', 'Applied To'].map(l => <th key={l} style={th}>{l}</th>)}
                        {['Received', 'Unapplied'].map(l => <th key={l} style={{ ...th, textAlign: 'right' }}>{l}</th>)}
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.payments.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>
                          No payments from this client yet.
                        </td></tr>
                      ) : ledger.payments.map((p: any, idx: number) => (
                        <tr key={p.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                          <td style={{ ...td, fontWeight: 400, color: '#64748B' }}>{fmtDate(p.paidAt)}</td>
                          <td style={td}>{METHOD_LABEL[p.method] ?? p.method}</td>
                          <td style={{ ...td, fontWeight: 400, color: '#64748B' }}>{p.reference || ''}</td>
                          <td style={{ ...td, fontWeight: 400 }}>
                            {p.allocations.length === 0 ? (
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '1px 7px', borderRadius: 4, background: '#EDE9FE', color: '#5B21B6' }}>ADVANCE</span>
                            ) : (
                              <span style={{ color: TEAL, fontWeight: 700 }}>{p.allocations.map((a: any) => a.invoice.invoiceNumber).join(', ')}</span>
                            )}
                            {p.bonus > 0 && (
                              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, padding: '1px 7px', borderRadius: 4, background: '#DCFCE7', color: '#166534' }}>
                                +{money(p.bonus)} BONUS
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: 'right' }}>{money(p.amount)}</td>
                          <td style={{ ...td, textAlign: 'right', color: p.unapplied > 0 ? '#5B21B6' : '#94A3B8' }}>{money(p.unapplied)}</td>
                          <td style={{ ...td, overflow: 'visible' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {p.unapplied > 0 && (
                                <button onClick={() => setApplyPay(p)} title="Apply this credit to an invoice"
                                  style={{ padding: '0 9px', height: 26, borderRadius: 6, border: 'none', background: '#7B2D8E', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                                  Apply
                                </button>
                              )}
                              <button onClick={() => handleDeletePayment(p.id)} disabled={delPayId === p.id} title="Delete payment"
                                style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #FCA5A5', background: '#fff', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: delPayId === p.id ? 0.5 : 1 }}>
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {viewInv   && <InvoiceView inv={viewInv} onClose={() => setViewInv(null)} onDeleted={() => { setViewInv(null); refresh() }} onEdit={i => { setViewInv(null); setEditInv(i) }} />}
      {editInv   && <InvoiceFormModal clientId={editInv.clientId} clientName={editInv.client?.businessName ?? editInv.client?.user?.fullName ?? 'Client'} inv={editInv} onClose={() => setEditInv(null)} onSaved={() => { setEditInv(null); refresh() }} />}
      {showNewInvoice && (selectedClient ?? ledger?.client) && (
        <InvoiceFormModal
          clientId={(selectedClient ?? ledger?.client)?.id}
          clientName={(selectedClient ?? ledger?.client)?.businessName ?? (selectedClient ?? ledger?.client)?.user?.fullName ?? 'Client'}
          onClose={() => setShowNewInvoice(false)}
          onSaved={() => { setShowNewInvoice(false); refresh() }}
        />
      )}
      {openBal   && <OpeningBalanceModal client={openBal.client} mode={openBal.mode} onClose={() => setOpenBal(null)} onSaved={() => { setOpenBal(null); refresh() }} />}

      {/* Right-click menu on a client */}
      {ctxMenu && (
        <div style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 1200, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: 4, minWidth: 190 }}>
          {[
            { label: 'Open',                  run: () => { setSelectedId(ctxMenu.client.id); setTab('history'); setPayClient(null) } },
            { label: 'Add Opening Balance',   run: () => setOpenBal({ client: ctxMenu.client, mode: 'add' }) },
            { label: 'Edit Opening Balance',  run: () => setOpenBal({ client: ctxMenu.client, mode: 'edit' }) },
          ].map(item => (
            <button key={item.label} onClick={() => { item.run(); setCtxMenu(null) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: NAVY, fontFamily: F, borderRadius: 6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              {item.label}
            </button>
          ))}
        </div>
      )}

    </div>
  )
}
