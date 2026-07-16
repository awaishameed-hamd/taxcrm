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
  DRAFT:             { label: 'Draft',          color: '#5C5C5C', bg: '#F1F5F9' },
  SENT:              { label: 'Sent',           color: '#1E40AF', bg: '#DBEAFE' },
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

const iso = (d: Date) => d.toISOString().split('T')[0]

// Date-range presets for the ledger. `null` means unbounded — the account from day one.
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
      await api.patch(`/invoices/${inv.id}`, { amount: Number(amount) || 0, description, dueDate: dueDate || undefined, notes })
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
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} placeholder="Shown on the invoice" />
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

// ─── Receive Payment (QuickBooks-style) ───────────────────────────────────────
// Renders inline in the right pane, like the Attendance Report calendar — not as an overlay.
function ReceivePaymentPanel({ client, onClose, onSaved }: { client: any; onClose: () => void; onSaved: () => void }) {
  const [open,      setOpen]      = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [received,  setReceived]  = useState('')
  const [alloc,     setAlloc]     = useState<Record<string, string>>({})
  const [method,    setMethod]    = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [paidAt,    setPaidAt]    = useState(new Date().toISOString().split('T')[0])
  const [notes,     setNotes]     = useState('')
  const [proofUrl,  setProofUrl]  = useState('')
  const [proofName, setProofName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    api.get(`/invoices/open/${client.id}`)
      .then(({ data }) => setOpen(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => setOpen([]))
      .finally(() => setLoading(false))
  }, [client.id])

  const totalOpen    = open.reduce((s, i) => s + Number(i.balance), 0)
  const totalApplied = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0)
  const amountRecv   = Number(received) || 0
  const unapplied    = amountRecv - totalApplied

  // Spread whatever was received across the oldest invoices first, like QuickBooks does
  function autoApply(amountStr: string) {
    setReceived(amountStr)
    let left = Number(amountStr) || 0
    const next: Record<string, string> = {}
    for (const inv of open) {
      if (left <= 0) break
      const take = Math.min(left, Number(inv.balance))
      next[inv.id] = String(take)
      left -= take
    }
    setAlloc(next)
  }

  function setOne(id: string, value: string) {
    setAlloc(p => ({ ...p, [id]: value }))
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
    const allocations = Object.entries(alloc)
      .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) || 0 }))
      .filter(a => a.amount > 0)
    if (allocations.length === 0) { setError('Apply the payment to at least one invoice'); return }

    setSaving(true); setError('')
    try {
      await api.post('/invoices/receive-payment', {
        clientId: client.id, method,
        reference: reference || undefined, proofUrl: proofUrl || undefined,
        paidAt: paidAt || undefined, notes: notes || undefined,
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
            <h2 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 20, display: 'inline-block', transform: 'skewX(12deg)', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
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
            <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12, fontFamily: F, border: `1px solid ${P.border}`, borderRadius: 8 }}>
              Nothing outstanding for this client.
            </div>
          ) : (
            <div style={{ border: `1px solid ${P.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Invoice', 'Date', 'Due', 'Open Balance', 'Payment'].map((h, i) => (
                      <th key={h} style={{ ...cell, fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', color: '#64748B', textTransform: 'uppercase', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {open.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ ...cell, fontWeight: 700, color: TEAL }}>{inv.invoiceNumber}</td>
                      <td style={{ ...cell, color: '#64748B' }}>{fmtDate(inv.issueDate)}</td>
                      <td style={{ ...cell, color: '#64748B' }}>{inv.dueDate ? fmtDate(inv.dueDate) : '—'}</td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: NAVY }}>{money(inv.balance)}</td>
                      <td style={{ ...cell, textAlign: 'right', width: 120 }}>
                        <input type="number" min={0} max={inv.balance} value={alloc[inv.id] ?? ''}
                          onChange={e => setOne(inv.id, e.target.value)} placeholder="0"
                          style={{ ...inputStyle, padding: '5px 8px', textAlign: 'right', fontSize: 12.5, fontWeight: 700 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <div style={{ width: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F }}>
                <span style={{ color: '#64748B' }}>Amount received</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{money(amountRecv)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontFamily: F, borderBottom: `1px solid ${P.border}` }}>
                <span style={{ color: '#64748B' }}>Applied to invoices</span>
                <span style={{ fontWeight: 700, color: '#16a34a' }}>{money(totalApplied)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', fontSize: 13, fontFamily: F }}>
                <span style={{ fontWeight: 900, color: NAVY }}>Unapplied</span>
                <span style={{ fontWeight: 900, color: Math.abs(unapplied) < 0.01 ? '#16a34a' : '#D97706' }}>{money(unapplied)}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
            <button onClick={save} disabled={saving || uploading || totalApplied <= 0}
              style={{ ...btn('#16a34a'), opacity: (saving || uploading || totalApplied <= 0) ? 0.6 : 1 }}>
              {saving ? 'Saving…' : `Record ${money(totalApplied)}`}
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
  const [clients,     setClients]     = useState<any[]>([])
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [ledger,      setLedger]      = useState<any>(null)
  const [searchInput,   setSearchInput]   = useState('')
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState<'history' | 'invoices'>('history')
  const [busy,          setBusy]          = useState<string | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)

  const [range,      setRange]      = useState<RangeKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const [editInv,    setEditInv]    = useState<Invoice | null>(null)
  const [viewInv,    setViewInv]    = useState<Invoice | null>(null)
  const [payClient,  setPayClient]  = useState<any>(null)
  const [openBal,    setOpenBal]    = useState<{ client: any; mode: 'add' | 'edit' } | null>(null)
  const [confirmDel, setConfirmDel] = useState<Invoice | null>(null)
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

  async function act(id: string, path: string) {
    setBusy(id)
    try { await api.post(`/invoices/${id}/${path}`); refresh() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Action failed') }
    finally { setBusy(null) }
  }

  async function doDelete() {
    if (!confirmDel) return
    setBusy(confirmDel.id)
    try { await api.delete(`/invoices/${confirmDel.id}`); setConfirmDel(null); refresh() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Delete failed') }
    finally { setBusy(null) }
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

  // Row action buttons, shared by the ledger and the all-invoices list
  function actions(r: Invoice) {
    const isDraft  = r.status === 'DRAFT'
    const disabled = busy === r.id
    return (
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
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: P.bgMain, fontFamily: F }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left panel: clients ── */}
        <div style={{ width: listCollapsed ? 0 : 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#EDF0F3', borderRight: `1px solid ${P.border}`, overflow: 'hidden', transition: 'width .25s' }}>

          <div style={{ flexShrink: 0, borderBottom: `1px solid ${P.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: '0 14px' }}>
              <h2 style={{ margin: 0, fontFamily: "'Angelos', sans-serif", fontSize: 22, color: NAVY, display: 'inline-block', transform: 'skewX(12deg)' }}>Invoicing</h2>
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
                <button key={c.id} onClick={() => { setSelectedId(c.id); setTab('history'); setPayClient(null) }}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, client: c }) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: `1px solid ${active ? TEAL : P.border}`, borderRadius: 8, cursor: 'pointer', marginBottom: 6, background: active ? '#E8EEF7' : '#F8FAFC', fontFamily: F, opacity: c.isActive ? 1 : 0.55 }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#EEF2F7' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: active ? TEAL : NAVY }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? TEAL : NAVY, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.businessName ?? c.fullName}
                    </span>
                    {c.draftCount > 0 && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 20, color: '#5C5C5C', background: '#E2E8F0', flexShrink: 0 }}>{c.draftCount}</span>
                    )}
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 20, flexShrink: 0, color: c.outstanding > 0 ? '#B91C1C' : '#166534', background: c.outstanding > 0 ? '#FEE2E2' : '#DCFCE7' }}>
                      {money(c.outstanding)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Header */}
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, padding: '0 20px' }}>
            {listCollapsed && (
              <button onClick={() => setListCollapsed(false)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg,${TEAL} 0%,#0E5F6E 100%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
            <h1 style={{ margin: 0, fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: NAVY }}>
              {selectedId === null ? 'All Invoices' : (ledger?.client?.businessName ?? ledger?.client?.user?.fullName ?? 'Client Account')}
            </h1>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', minWidth: 0 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: P.textMuted, fontSize: 13, fontFamily: F }}>Loading…</div>
          ) : payClient ? (
            <ReceivePaymentPanel client={payClient} onClose={() => setPayClient(null)} onSaved={() => { setPayClient(null); refresh() }} />
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
                <StatCard label="Outstanding"     value={money(ledger.outstanding)}    border="#DC2626" fill="#FECACA" />
              </div>

              {/* Tabs + period filter + actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', marginBottom: 14, flexWrap: 'wrap' }}>
                {([['history', 'Account History'], ['invoices', `Invoices (${ledger.invoices.length})`]] as const).map(([k, l]) => (
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

                <button onClick={() => setPayClient(selectedClient ?? ledger.client)}
                  style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: F, background: '#16a34a', color: '#fff' }}>
                  Receive Payment
                </button>
              </div>

              {tab === 'history' ? (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '14%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} />
                      <col style={{ width: '27%' }} /><col style={{ width: '12%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F2AC18' }}>
                        {['Date', 'Type', 'Reference', 'Description'].map(l => <th key={l} style={th}>{l}</th>)}
                        {['Charge', 'Payment', 'Balance'].map(l => <th key={l} style={{ ...th, textAlign: 'right' }}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.timeline.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>
                          Nothing billed to this client yet. Drafts appear under the Invoices tab.
                        </td></tr>
                      ) : ledger.timeline.map((t: any, idx: number) => {
                        const meta = t.type === 'PAYMENT'
                          ? { label: 'Payment', color: '#166534', bg: '#DCFCE7' }
                          : t.type === 'OPENING'
                            ? { label: 'Opening', color: '#5C5C5C', bg: '#F1F5F9' }
                            : { label: 'Invoice', color: '#1E40AF', bg: '#DBEAFE' }
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
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '14%' }} /><col style={{ width: '13%' }} /><col style={{ width: '27%' }} />
                      <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '12%' }} /><col style={{ width: 120 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F2AC18' }}>
                        {['Invoice #', 'Date', 'Description', 'Amount', 'Balance', 'Status'].map(l => <th key={l} style={th}>{l}</th>)}
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.invoices.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: F }}>No invoices for this client yet.</td></tr>
                      ) : ledger.invoices.map((r: Invoice, idx: number) => {
                        const st = STATUS_META[r.status] ?? STATUS_META.DRAFT
                        const balance = Number(r.amount) - Number(r.amountPaid)
                        return (
                          <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                            <td style={{ ...td, color: TEAL }}>{r.invoiceNumber}</td>
                            <td style={{ ...td, fontWeight: 400, color: '#64748B' }}>{fmtDate(r.issueDate)}</td>
                            <td style={{ ...td, fontWeight: 400 }}>
                              {r.description ?? '—'}
                              {r.retainerCovered && r.status === 'DRAFT' && (
                                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4, background: '#EDE9FE', color: '#5B21B6' }}>IN RETAINER?</span>
                              )}
                            </td>
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
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {editInv   && <EditModal inv={editInv} onClose={() => setEditInv(null)} onSaved={() => { setEditInv(null); refresh() }} />}
      {viewInv   && <InvoiceView inv={viewInv} onClose={() => setViewInv(null)} />}
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
