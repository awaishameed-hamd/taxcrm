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

export default function ApplyCreditPanel({ payment, onClose, onSaved }: { payment: any; onClose: () => void; onSaved: () => void }) {
  const [open,     setOpen]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [alloc,    setAlloc]    = useState<Record<string, Adj>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const credit = Number(payment.unapplied)

  useEffect(() => {
    api.get(`/invoices/open/${payment.clientId}`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.data ?? []
        setOpen(list)
        // Every invoice starts ticked with its full balance auto-filled from the
        // credit, oldest first. Unticking a row frees that credit for the rest.
        setSelected(Object.fromEntries(list.map((i: any) => [i.id, true])))
        let left = credit
        const next: Record<string, Adj> = {}
        for (const inv of list) {
          const take = Math.min(Math.max(0, left), Number(inv.balance))
          next[inv.id] = { ...blankAdj(), amount: take > 0 ? String(take) : '' }
          left -= take
        }
        setAlloc(next)
      })
      .catch(() => setOpen([]))
      .finally(() => setLoading(false))
  }, [payment.clientId, credit])

  // Spread the available credit across the ticked invoices oldest-first, leaving
  // room for any discount or withholding already typed on a row.
  function autoApply(sel: Record<string, boolean>) {
    let left = credit
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
  function toggleRow(id: string) { const s = { ...selected, [id]: !selected[id] }; setSelected(s); autoApply(s) }
  function toggleAll() {
    const allOn = open.length > 0 && open.every(i => selected[i.id])
    const s = Object.fromEntries(open.map(i => [i.id, !allOn]))
    setSelected(s); autoApply(s)
  }
  function setField(id: string, key: keyof Adj, value: string) {
    setAlloc(p => ({ ...p, [id]: { ...(p[id] ?? blankAdj()), [key]: value } }))
    // Entering a discount or withheld tax reduces how much credit that invoice
    // still needs, so re-spread the credit and keep the row's Left at 0.
    if (key !== 'amount') autoApply(selected)
  }

  const totalApplied  = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'amount'), 0)
  const totalDiscount = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'discount'), 0)
  const totalItw      = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'incomeTaxWithheld'), 0)
  const totalStw      = Object.values(alloc).reduce((s, a) => s + adjNum(a, 'salesTaxWithheld'), 0)
  const totalSettled  = totalApplied + totalDiscount + totalItw + totalStw
  const creditLeft    = credit - totalApplied

  async function save() {
    const allocations = Object.entries(alloc)
      .map(([invoiceId, a]) => ({
        invoiceId,
        amount:            adjNum(a, 'amount'),
        discount:          adjNum(a, 'discount'),
        incomeTaxWithheld: adjNum(a, 'incomeTaxWithheld'),
        salesTaxWithheld:  adjNum(a, 'salesTaxWithheld'),
      }))
      .filter(a => a.amount + a.discount + a.incomeTaxWithheld + a.salesTaxWithheld > 0)
    if (allocations.length === 0) { setError('Apply the credit to at least one invoice'); return }
    if (creditLeft < -0.001)      { setError('Applied more credit than is available'); return }

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
                    { h: 'Invoice',       w: undefined },
                    { h: 'Open Balance',  w: 100 },
                    { h: 'Applied',       w: 96 },
                    { h: 'Discount',      w: 92 },
                    { h: 'Income Tax W/H', w: 96 },
                    { h: 'Sales Tax W/H',  w: 96 },
                    { h: 'Left',          w: 84 },
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
            Discount and withheld tax close the invoice without using credit. Get <strong>Left</strong> to 0 and it's marked Paid.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <div style={{ width: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Available credit</span>
              <span style={{ fontWeight: 700, color: NAVY }}>{money(credit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Applying now</span>
              <span style={{ fontWeight: 700, color: '#16a34a' }}>{money(totalApplied)}</span>
            </div>
            {totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Discount allowed</span>
                <span style={{ fontWeight: 700, color: '#D97706' }}>{money(totalDiscount)}</span>
              </div>
            )}
            {(totalItw > 0 || totalStw > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Withheld at source</span>
                <span style={{ fontWeight: 700, color: '#D97706' }}>{money(totalItw + totalStw)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderTop: `1px solid ${P.border}`, borderBottom: `1px solid ${P.border}` }}>
              <span style={{ fontWeight: 700, color: NAVY }}>Invoices settled</span>
              <span style={{ fontWeight: 700, color: NAVY }}>{money(totalSettled)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', fontSize: 13 }}>
              <span style={{ fontWeight: 900, color: NAVY }}>Credit left</span>
              <span style={{ fontWeight: 900, color: creditLeft < -0.001 ? '#D62828' : '#5B21B6' }}>{money(creditLeft)}</span>
            </div>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving || totalSettled <= 0 || creditLeft < -0.001}
            style={{ ...btn('#16a34a'), opacity: (saving || totalSettled <= 0 || creditLeft < -0.001) ? 0.6 : 1 }}>
            {saving ? 'Applying…' : `Apply ${money(totalApplied)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit a recorded payment (fix a wrong amount, method or date) ─────────────
// Read-only look at a payment, the counterpart to viewing an invoice
