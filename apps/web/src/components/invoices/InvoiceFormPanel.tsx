'use client'

import { useState } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const money = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

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

// The one invoice form. It covers all three ways in, and which one it is comes
// from the invoice it was handed rather than from a flag the caller sets:
//
//   no invoice        a new manual invoice, created and sent in one go
//   a DRAFT invoice   pricing from Invoice Approval, so Save Draft joins Send
//   an issued invoice editing one already with the client
//
// Keeping it as one component is the point: pricing a draft and correcting an
// invoice are the same form, so they should not be able to drift apart.
export default function InvoiceFormPanel({ clientId, clientName, inv, onClose, onSaved }: {
  clientId: string
  clientName: string
  inv?: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit  = !!inv
  const isDraft = inv?.status === 'DRAFT'

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

  // `send` is what separates saving a draft from issuing it. A new invoice always
  // sends, so it lands in the client's ledger instead of sitting as a hidden draft.
  async function save(send: boolean) {
    if (send && total <= 0)  { setError('Set an amount before sending'); return }
    if (!description.trim()) { setError('Add a description'); return }
    setSaving(true); setError('')
    try {
      const body = {
        subtotal: nSub, salesTax: nTax, outOfPocket: nOop,
        description: description.trim(),
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      }
      let id = inv?.id
      if (isEdit) {
        await api.patch(`/invoices/${id}`, body)
      } else {
        const { data } = await api.post('/invoices', { clientId, ...body })
        id = (data?.data ?? data).id
      }
      if (send && (!isEdit || isDraft)) await api.post(`/invoices/${id}/send`)
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not save the invoice')
    } finally { setSaving(false) }
  }

  const title = !isEdit ? 'New Invoice' : isDraft ? inv.invoiceNumber : `Edit ${inv.invoiceNumber}`

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
      {/* Header */}
      <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0 }}>
            {title}
          </h2>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: F }}>
            {clientName}
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
            {inv?.kind === 'RETAINER' && (
              <p style={{ margin: '5px 0 0', fontSize: 11, color: '#5B21B6', fontFamily: F, fontWeight: 700 }}>
                Pre-filled from the client's agreed monthly retainership
              </p>
            )}
            {inv?.kind === 'ANNUAL' && (
              <p style={{ margin: '5px 0 0', fontSize: 11, color: '#B45309', fontFamily: F, fontWeight: 700 }}>
                Pre-filled from the client's agreed annual retainership
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

          {/* A draft can be priced without going out yet, which is the one thing
              this form does from Invoice Approval that it does not do elsewhere. */}
          {isDraft && (
            <button onClick={() => save(false)} disabled={saving} style={{ ...btn('#fff', NAVY), border: `1px solid ${P.border}`, opacity: saving ? 0.6 : 1 }}>
              Save Draft
            </button>
          )}

          {isEdit && !isDraft ? (
            <button onClick={() => save(false)} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          ) : (
            <button onClick={() => save(true)} disabled={saving || total <= 0} style={{ ...btn(TEAL), opacity: (saving || total <= 0) ? 0.6 : 1 }}>
              {saving ? 'Saving…' : isDraft ? 'Save & Send' : 'Create & Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
