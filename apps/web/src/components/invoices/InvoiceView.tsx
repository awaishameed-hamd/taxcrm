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
  balanceOf, dueOf, hexToRgb,
} from './invoiceShared'
import type { RangeKey, Invoice, Adj } from './invoiceShared'

export default function InvoiceView({ inv: initialInv, onClose, onDeleted, onEdit, onChanged }: { inv: Invoice; onClose: () => void; onDeleted?: () => void; onEdit?: (inv: Invoice) => void; onChanged?: () => void }) {
  // Kept in local state so removing a payment can refresh the view in place, at
  // which point the invoice has no payments and can be deleted.
  const [inv, setInv] = useState<Invoice>(initialInv)
  useEffect(() => { setInv(initialInv) }, [initialInv])
  const balance = balanceOf(inv)
  const st = STATUS_META[inv.status] ?? STATUS_META.DRAFT
  const clientName = inv.client?.businessName ?? inv.client?.user?.fullName ?? 'Client'
  const [busy, setBusy] = useState(false)
  // Two-step delete: the first click arms it, the second confirms.
  const [confirmDel, setConfirmDel] = useState(false)
  const [delBusy,    setDelBusy]    = useState(false)
  const [delError,   setDelError]   = useState('')
  const [rmPayId,    setRmPayId]    = useState<string | null>(null)

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

  // Removing a payment always works, it takes its cash, discount and any withheld
  // tax with it and reopens the invoice, which can then be deleted.
  async function handleRemovePayment(paymentId: string) {
    if (!window.confirm('Remove this payment? It takes the cash and any discount or tax withheld recorded with it, and reopens the invoices it settled. You can then delete the invoice.')) return
    setRmPayId(paymentId); setDelError('')
    try {
      await api.delete(`/invoices/payments/${paymentId}`)
      const { data } = await api.get(`/invoices/${inv.id}`)
      setInv(data.data ?? data)
      onChanged?.()
    } catch (e: any) {
      setDelError(e?.response?.data?.message ?? 'Could not remove this payment.')
    } finally {
      setRmPayId(null)
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
                        <td style={{ padding: '7px 0', textAlign: 'right', width: 34 }}>
                          {a.payment?.id && (
                            <button onClick={() => handleRemovePayment(a.payment.id)} disabled={rmPayId === a.payment.id} title="Remove this payment"
                              style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: 2, opacity: rmPayId === a.payment.id ? 0.5 : 1, display: 'inline-flex' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          )}
                        </td>
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
