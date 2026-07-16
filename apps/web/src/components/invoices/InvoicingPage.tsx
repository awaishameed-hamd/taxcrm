'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:             { label: 'Draft',         color: '#5C5C5C', bg: '#F1F5F9' },
  SENT:              { label: 'Sent',          color: '#1E40AF', bg: '#DBEAFE' },
  PARTIALLY_PAID:    { label: 'Partially Paid',color: '#92400E', bg: '#FEF3C7' },
  PAID:              { label: 'Paid',          color: '#166534', bg: '#DCFCE7' },
  RETAINER_INCLUDED: { label: 'In Retainer',   color: '#5B21B6', bg: '#EDE9FE' },
  CANCELLED:         { label: 'Cancelled',     color: '#991B1B', bg: '#FEE2E2' },
}

const PAYMENT_METHODS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'CHEQUE',        label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'ONLINE',        label: 'Online' },
  { value: 'OTHER',         label: 'Other' },
]
const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]))

const FILTERS = ['ALL', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'RETAINER_INCLUDED', 'CANCELLED']

const money = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

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

// ─── Edit invoice ─────────────────────────────────────────────────────────────
function EditModal({ inv, onClose, onSaved }: { inv: Invoice; onClose: () => void; onSaved: () => void }) {
  const [amount,      setAmount]      = useState(inv.amount != null ? String(Number(inv.amount)) : '')
  const [description, setDescription] = useState(inv.description ?? '')
  const [dueDate,     setDueDate]     = useState(inv.dueDate ? inv.dueDate.split('T')[0] : '')
  const [notes,       setNotes]       = useState(inv.notes ?? '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      await api.patch(`/invoices/${inv.id}`, {
        amount: Number(amount) || 0, description, dueDate: dueDate || undefined, notes,
      })
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: F }}>Edit Invoice</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: P.textMuted, fontFamily: F }}>{inv.invoiceNumber}</p>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Amount (PKR) <span style={{ color: '#ef4444' }}>*</span></label>
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is being billed" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ ...inputStyle, resize: 'none' }} placeholder="Shown on the invoice" />
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Record payment (single or bulk) ──────────────────────────────────────────
function PaymentModal({ invoices, onClose, onSaved }: { invoices: Invoice[]; onClose: () => void; onSaved: () => void }) {
  const isBulk    = invoices.length > 1
  const totalDue  = invoices.reduce((s, i) => s + (Number(i.amount) - Number(i.amountPaid)), 0)

  const [amount,    setAmount]    = useState(String(totalDue))
  const [method,    setMethod]    = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [paidAt,    setPaidAt]    = useState(new Date().toISOString().split('T')[0])
  const [notes,     setNotes]     = useState('')
  const [proofUrl,  setProofUrl]  = useState('')
  const [proofName, setProofName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  // Bulk always settles each invoice in full — partial only makes sense one invoice at a time
  const payAmount = isBulk ? totalDue : Number(amount) || 0
  const isPartial = !isBulk && payAmount > 0 && payAmount < totalDue

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
    if (payAmount <= 0) { setError('Enter an amount'); return }
    setSaving(true); setError('')
    try {
      for (const inv of invoices) {
        const due = Number(inv.amount) - Number(inv.amountPaid)
        await api.post(`/invoices/${inv.id}/payments`, {
          amount: isBulk ? due : payAmount,
          method, reference: reference || undefined, proofUrl: proofUrl || undefined,
          paidAt: paidAt || undefined, notes: notes || undefined,
        })
      }
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to record payment') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: F }}>Record Payment</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: P.textMuted, fontFamily: F }}>
          {isBulk ? `${invoices.length} invoices — settling each in full` : invoices[0].invoiceNumber}
        </p>

        <div style={{ background: '#F8FAFC', border: `1px solid ${P.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: F }}>
            <span style={{ color: P.textMuted }}>Total outstanding</span>
            <span style={{ fontWeight: 900, color: NAVY }}>PKR {money(totalDue)}</span>
          </div>
        </div>

        {!isBulk && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Amount Received (PKR) <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="number" min={0} max={totalDue} value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
            {isPartial && (
              <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, color: '#92400E', fontFamily: F }}>
                Partial payment — PKR {money(totalDue - payAmount)} will remain outstanding
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Method <span style={{ color: '#ef4444' }}>*</span></label>
            <StyledSelect value={method} onChange={setMethod} options={PAYMENT_METHODS} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Reference</label>
          <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque no. / transaction ID" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Payment Proof</label>
          {proofUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4' }}>
              <span style={{ flex: 1, fontSize: 12, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: F }}>{proofName}</span>
              <button onClick={() => { setProofUrl(''); setProofName('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 15, lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: `1px dashed ${P.border}`, cursor: 'pointer', fontSize: 12, color: '#94A3B8', background: '#FAFAFA', fontFamily: F }}>
              {uploading ? 'Uploading…' : 'Upload receipt / screenshot'}
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleUpload} />
            </label>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving || uploading} style={{ ...btn('#16a34a'), opacity: (saving || uploading) ? 0.6 : 1 }}>
            {saving ? 'Saving…' : `Record PKR ${money(payAmount)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice view / print ─────────────────────────────────────────────────────
function InvoiceView({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const balance = Number(inv.amount) - Number(inv.amountPaid)
  const st = STATUS_META[inv.status] ?? STATUS_META.DRAFT

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: absolute !important; left: 0; top: 0; width: 100%; box-shadow: none !important; border-radius: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: 780 }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <button onClick={() => window.print()} style={btn(NAVY)}>Download / Print</button>
          <button onClick={onClose} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Close</button>
        </div>

        <div id="invoice-print" style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
          {/* Letterhead */}
          <div style={{ background: NAVY, color: '#fff', padding: '28px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.06em', fontFamily: F }}>ASIF ASSOCIATES</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3, fontFamily: F, letterSpacing: '0.05em' }}>Chartered Accountants &amp; Tax Consultants</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '0.1em', fontFamily: F, opacity: 0.95 }}>INVOICE</div>
              <div style={{ fontSize: 12, marginTop: 4, fontFamily: F, opacity: 0.8 }}>{inv.invoiceNumber}</div>
            </div>
          </div>

          {/* Meta */}
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
                {inv.dueDate && (
                  <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F }}>
                    <span style={{ color: '#94A3B8', minWidth: 74 }}>Due Date</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{fmtDate(inv.dueDate)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: F, alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8', minWidth: 74 }}>Status</span>
                  <span style={{ fontWeight: 800, padding: '2px 10px', borderRadius: 20, fontSize: 11, color: st.color, background: st.bg }}>{st.label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
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

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <div style={{ width: 260 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, fontFamily: F }}>
                  <span style={{ color: '#64748B' }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{money(inv.amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, fontFamily: F, borderBottom: `1px solid ${P.border}` }}>
                  <span style={{ color: '#64748B' }}>Paid</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>− {money(inv.amountPaid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 15, fontFamily: F }}>
                  <span style={{ fontWeight: 900, color: NAVY }}>Balance Due</span>
                  <span style={{ fontWeight: 900, color: balance > 0 ? '#D62828' : '#16a34a' }}>PKR {money(balance)}</span>
                </div>
              </div>
            </div>

            {/* Payment history */}
            {(inv.payments ?? []).length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>PAYMENTS RECEIVED</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
                  <tbody>
                    {inv.payments.map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${P.gridLine}` }}>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#64748B' }}>{fmtDate(p.paidAt)}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#64748B' }}>{METHOD_LABEL[p.method] ?? p.method}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, color: '#94A3B8' }}>{p.reference ?? ''}</td>
                        <td style={{ padding: '7px 0', fontSize: 12, fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ padding: '16px 36px 24px', borderTop: `1px solid ${P.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: F }}>Thank you for your business.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InvoicingPage() {
  const [rows,     setRows]     = useState<Invoice[]>([])
  const [summary,  setSummary]  = useState<any>({ draftCount: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0 })
  const [loading,  setLoading]  = useState(true)
  const [status,   setStatus]   = useState('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy,     setBusy]     = useState<string | null>(null)

  const [editInv,    setEditInv]    = useState<Invoice | null>(null)
  const [viewInv,    setViewInv]    = useState<Invoice | null>(null)
  const [payInvs,    setPayInvs]    = useState<Invoice[] | null>(null)
  const [confirmDel, setConfirmDel] = useState<Invoice | null>(null)

  const fetchAll = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    Promise.all([
      api.get('/invoices', { params: { ...(status !== 'ALL' ? { status } : {}), ...(search ? { search } : {}) } })
        .then(({ data }) => setRows(Array.isArray(data) ? data : data.data ?? [])),
      api.get('/invoices/summary').then(({ data }) => setSummary(data?.data ?? data)),
    ]).catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [status, search])

  useEffect(() => { fetchAll() }, [fetchAll])
  useAutoRefresh(() => fetchAll(true))

  // Only issued, not-yet-settled invoices can take a payment
  const payable = useMemo(() => rows.filter(r => r.status === 'SENT' || r.status === 'PARTIALLY_PAID'), [rows])
  const selectedInvoices = useMemo(() => payable.filter(r => selected.includes(r.id)), [payable, selected])

  async function act(id: string, path: string) {
    setBusy(id)
    try { await api.post(`/invoices/${id}/${path}`); fetchAll() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Action failed') }
    finally { setBusy(null) }
  }

  async function doDelete() {
    if (!confirmDel) return
    setBusy(confirmDel.id)
    try { await api.delete(`/invoices/${confirmDel.id}`); setConfirmDel(null); fetchAll() }
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

  const cards = [
    { label: 'Drafts',         value: String(summary.draftCount), color: '#5C5C5C' },
    { label: 'Total Invoiced', value: `PKR ${money(summary.totalInvoiced)}`, color: NAVY },
    { label: 'Total Received', value: `PKR ${money(summary.totalPaid)}`, color: '#16a34a' },
    { label: 'Outstanding',    value: `PKR ${money(summary.outstanding)}`, color: '#D62828' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 900, color: NAVY, fontFamily: F }}>Invoicing &amp; Payments</h2>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8', fontFamily: F }}>{c.label}</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: c.color, fontFamily: F, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setStatus(f); setSelected([]) }} style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: F, whiteSpace: 'nowrap',
              background: status === f ? NAVY : 'transparent',
              color: status === f ? '#fff' : 'rgba(255,255,255,0.85)',
            }}>
              {f === 'ALL' ? 'All' : STATUS_META[f].label}
            </button>
          ))}

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          <div style={{ position: 'relative', flex: 1, minWidth: 150, maxWidth: 240 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search client / invoice…" value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setSearch(e.target.value) }}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
          </div>

          <span style={{ flex: 1 }} />

          {selectedInvoices.length > 0 && (
            <button onClick={() => setPayInvs(selectedInvoices)}
              style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: F, background: '#16a34a', color: '#fff' }}>
              Record Payment ({selectedInvoices.length})
            </button>
          )}

          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', padding: '0 4px' }}>{rows.length} invoices</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 38 }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: 116 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              <th style={{ ...th, padding: '8px 0 8px 12px' }}>
                <input type="checkbox" style={{ accentColor: NAVY, width: 14, height: 14, cursor: 'pointer' }}
                  checked={payable.length > 0 && selected.length === payable.length}
                  onChange={e => setSelected(e.target.checked ? payable.map(r => r.id) : [])} />
              </th>
              {['Invoice #', 'Client', 'Description', 'Amount', 'Balance', 'Status'].map(l => <th key={l} style={th}>{l}</th>)}
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  {Array.from({ length: 8 }).map((__, c) => (
                    <td key={c} style={td}><div style={{ height: 12, borderRadius: 4, background: P.gridLine }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>
                {search ? `No invoices matching "${search}".` : 'No invoices yet. They appear here automatically when a task is completed.'}
              </td></tr>
            ) : rows.map((r, idx) => {
              const st       = STATUS_META[r.status] ?? STATUS_META.DRAFT
              const balance  = Number(r.amount) - Number(r.amountPaid)
              const isDraft  = r.status === 'DRAFT'
              const canPay   = r.status === 'SENT' || r.status === 'PARTIALLY_PAID'
              const disabled = busy === r.id

              return (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                  <td style={{ ...td, padding: '6px 0 6px 12px' }}>
                    {canPay && (
                      <input type="checkbox" style={{ accentColor: NAVY, width: 14, height: 14, cursor: 'pointer' }}
                        checked={selected.includes(r.id)}
                        onChange={e => setSelected(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />
                    )}
                  </td>
                  <td style={{ ...td, color: TEAL }}>{r.invoiceNumber}</td>
                  <td style={td}>{r.client?.businessName ?? r.client?.user?.fullName ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 400 }}>
                    {r.description ?? '—'}
                    {r.retainerCovered && isDraft && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4, background: '#EDE9FE', color: '#5B21B6', letterSpacing: '0.05em' }}>IN RETAINER?</span>
                    )}
                  </td>
                  <td style={td}>{money(r.amount)}</td>
                  <td style={{ ...td, color: balance > 0 ? '#D62828' : '#16a34a' }}>{money(balance)}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: st.color, background: st.bg }}>{st.label}</span>
                  </td>
                  <td style={{ ...td, overflow: 'visible' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => setViewInv(r)} title="View / Print"
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: NAVY }}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      </button>

                      {isDraft && (
                        <>
                          <button onClick={() => setEditInv(r)} title="Edit"
                            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}>
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => act(r.id, 'send')} disabled={disabled} title="Send to client"
                            style={{ padding: '0 8px', height: 26, borderRadius: 6, border: 'none', background: TEAL, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F, opacity: disabled ? 0.5 : 1 }}>
                            Send
                          </button>
                          <button onClick={() => act(r.id, 'mark-retainer')} disabled={disabled} title="Covered by monthly retainer"
                            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7B2D8E', opacity: disabled ? 0.5 : 1 }}>
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                          </button>
                          <button onClick={() => setConfirmDel(r)} title="Delete"
                            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                          </button>
                        </>
                      )}

                      {canPay && (
                        <button onClick={() => setPayInvs([r])} title="Record payment"
                          style={{ padding: '0 8px', height: 26, borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                          Pay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editInv && <EditModal inv={editInv} onClose={() => setEditInv(null)} onSaved={() => { setEditInv(null); fetchAll() }} />}
      {viewInv && <InvoiceView inv={viewInv} onClose={() => setViewInv(null)} />}
      {payInvs && <PaymentModal invoices={payInvs} onClose={() => setPayInvs(null)} onSaved={() => { setPayInvs(null); setSelected([]); fetchAll() }} />}

      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#D62828', fontFamily: F }}>Delete Invoice?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: P.textMuted, fontFamily: F, lineHeight: 1.5 }}>
              <strong>{confirmDel.invoiceNumber}</strong> will be permanently removed. This cannot be undone.
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
