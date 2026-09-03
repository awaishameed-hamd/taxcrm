'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { uploadFile } from '@/lib/storage'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import {
  NAVY, TEAL, F, STATUS_META, PAYMENT_METHODS, METHOD_LABEL, loadImage,
  RANGES, rangeBounds, StatCard, blankAdj, adjNum, adjTotal, money, fmtDate,
  iso, inputStyle, labelStyle, btn, eyeBtn, pencilBtn, eyeIcon, pencilIcon,
  balanceOf, dueOf,
} from './invoiceShared'
import type { RangeKey, Invoice, Adj } from './invoiceShared'

export default function ReceivePaymentPanel({ client, payment, onClose, onSaved }: { client: any; payment?: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!payment
  const [open,      setOpen]      = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [received,  setReceived]  = useState(isEdit ? String(Number(payment.amount)) : '')
  const [alloc,     setAlloc]     = useState<Record<string, Adj>>({})
  // Which invoices this payment is being put against, QuickBooks style. All are
  // ticked on load so the default stays "settle the oldest first".
  const [selected,  setSelected]  = useState<Record<string, boolean>>({})
  const [method,    setMethod]    = useState(isEdit ? payment.method : 'BANK_TRANSFER')
  const [reference, setReference] = useState(isEdit ? (payment.reference ?? '') : '')
  const [paidAt,    setPaidAt]    = useState(isEdit ? (payment.paidAt ?? '').split('T')[0] : new Date().toISOString().split('T')[0])
  const [notes,     setNotes]     = useState(isEdit ? (payment.notes ?? '') : '')
  const [proofUrl,  setProofUrl]  = useState(isEdit ? (payment.proofUrl ?? '') : '')
  const [proofName, setProofName] = useState(isEdit && payment.proofUrl ? 'Attached receipt' : '')
  const [overType,  setOverType]  = useState<'ADVANCE' | 'BONUS'>(isEdit ? (payment.overpaymentType ?? 'ADVANCE') : 'ADVANCE')
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    // Editing asks for this payment's invoices too, including any it closed
    // outright, with balances worked out as if the payment were not there.
    api.get(`/invoices/open/${client.id}`, { params: isEdit ? { paymentId: payment.id } : {} })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.data ?? []
        setOpen(list)
        if (isEdit) {
          // Start from where the payment actually sits, so opening the screen and
          // saving again changes nothing.
          setSelected(Object.fromEntries(list.map((i: any) => [i.id, !!i.current])))
          setAlloc(Object.fromEntries(list.map((i: any) => [i.id, i.current ? {
            amount:            i.current.amount            ? String(Number(i.current.amount))            : '',
            discount:          i.current.discount          ? String(Number(i.current.discount))          : '',
            incomeTaxWithheld: i.current.incomeTaxWithheld ? String(Number(i.current.incomeTaxWithheld)) : '',
            salesTaxWithheld:  i.current.salesTaxWithheld  ? String(Number(i.current.salesTaxWithheld))  : '',
          } : blankAdj()])))
        } else {
          setSelected(Object.fromEntries(list.map((i: any) => [i.id, true])))
        }
      })
      .catch(() => setOpen([]))
      .finally(() => setLoading(false))
  }, [client.id, isEdit, payment?.id])

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
      const up = await uploadFile(file, 'payment-proofs')
      setProofUrl(up.url)
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
      if (isEdit) {
        // Sending allocations replaces the set, which is what moves a payment
        // from the invoice it was booked against to the right one.
        await api.patch(`/invoices/payments/${payment.id}`, {
          amount: amountRecv, method,
          reference: reference || undefined, proofUrl: proofUrl || undefined,
          paidAt: paidAt || undefined, notes: notes || undefined,
          allocations,
        })
      } else {
        await api.post('/invoices/receive-payment', {
          clientId: client.id, amount: amountRecv, method,
          reference: reference || undefined, proofUrl: proofUrl || undefined,
          paidAt: paidAt || undefined, notes: notes || undefined,
          overpaymentType: unapplied > 0.001 ? overType : undefined,
          allocations,
        })
      }
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? (isEdit ? 'Failed to update payment' : 'Failed to record payment')) }
    finally { setSaving(false) }
  }

  const cell: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, fontFamily: F, borderBottom: `1px solid ${P.border}50` }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
        {/* Header */}
        <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
              {isEdit ? 'Edit Payment' : 'Receive Payment'}
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
              {saving ? 'Saving…' : isEdit ? `Save ${money(amountRecv)}` : `Record ${money(amountRecv)}`}
            </button>
          </div>
        </div>
    </div>
  )
}

// ─── Apply an advance payment's leftover credit to invoices ───────────────────
