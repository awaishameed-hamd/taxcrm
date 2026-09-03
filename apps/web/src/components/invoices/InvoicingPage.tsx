'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { uploadFile } from '@/lib/storage'
import { P } from '@/lib/palette'
import PillSelect from '@/components/ui/PillSelect'
import DataTable from '@/components/ui/DataTable'
import InvoiceFormPanel, { SERVICE_LABEL } from '@/components/invoices/InvoiceFormPanel'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { usePhone } from '@/hooks/useMediaQuery'
import ReceivePaymentPanel from './ReceivePaymentPanel'
import ApplyCreditPanel from './ApplyCreditPanel'
import PaymentView from './PaymentView'
import InvoiceView from './InvoiceView'
import OpeningBalanceModal from './OpeningBalanceModal'
import {
  NAVY, TEAL, F, STATUS_META, PAYMENT_METHODS, METHOD_LABEL, loadImage,
  RANGES, rangeBounds, StatCard, blankAdj, adjNum, adjTotal, money, fmtDate,
  iso, inputStyle, labelStyle, btn, eyeBtn, pencilBtn, eyeIcon, pencilIcon,
  balanceOf, dueOf,
} from './invoiceShared'
import type { RangeKey, Invoice, Adj } from './invoiceShared'

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
  const [viewPay,    setViewPay]    = useState<any>(null)
  const [editInv,    setEditInv]    = useState<Invoice | null>(null)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [payClient,  setPayClient]  = useState<any>(null)
  const [applyPay,   setApplyPay]   = useState<any>(null)
  const [editPay,    setEditPay]    = useState<any>(null)
  const [openBal,    setOpenBal]    = useState<{ client: any; mode: 'add' | 'edit' } | null>(null)
  const [ctxMenu,    setCtxMenu]    = useState<{ x: number; y: number; client: any } | null>(null)
  const [payMenu,    setPayMenu]    = useState<{ x: number; y: number; payment: any } | null>(null)

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

  useEffect(() => {
    if (!payMenu) return
    const close = () => setPayMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', close, true) }
  }, [payMenu])

  // Right-click on a payment (ledger or Payments tab) opens Edit / Delete, so
  // those actions stay off the cramped row, the way chat handles a message.
  function openPayMenu(e: React.MouseEvent, payment: any) {
    e.preventDefault()
    setPayMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: e.clientY, payment })
  }

  useEffect(() => { fetchClients() }, [fetchClients])
  useEffect(() => { fetchRight() }, [fetchRight])
  useAutoRefresh(() => { fetchClients(); fetchRight(true) })

  function refresh() { fetchClients(); fetchRight() }

  // A payment can always be removed. Deleting it takes its cash, discount and any
  // tax withheld with it, and reopens the invoices it had settled, so an invoice
  // that was blocked from deletion can then be deleted.
  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm('Delete this payment? This removes the received amount along with any discount or tax withheld recorded with it, and reopens the invoices it had settled.')) return
    try {
      await api.delete(`/invoices/payments/${paymentId}`)
      refresh()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Could not delete this payment.')
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
        <button onClick={() => setViewInv(r)} title="View / Print" style={eyeBtn}>{eyeIcon}</button>
        <button onClick={() => setEditInv(r)} title="Edit invoice" style={pencilBtn}>{pencilIcon}</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: P.bgMain, fontFamily: F }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left panel: clients ──
            A 340px rail beside the account leaves nothing usable on a phone, so
            there the list and the account take turns: list is the screen until
            you pick a client, then the account is, and the header chevron walks
            back. listCollapsed doubles as that master/detail switch. */}
        <div style={{
          width: phone ? (listCollapsed ? 0 : '100%') : (listCollapsed ? 0 : 340),
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
              <h2 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 18, color: '#1E8496', display: 'inline-block', whiteSpace: 'nowrap' }}>Client Ledgers</h2>
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
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', border: `1px solid ${active ? TEAL : P.border}`, borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: active ? '#E8EEF7' : '#F8FAFC', fontFamily: F, opacity: c.isActive ? 1 : 0.55 }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#EEF2F7' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* The Tasks rail numbers its rows, but this list runs to every
                        client the firm has, so a four-digit number would sit badly
                        in the square. The client's initial keeps the same marker
                        and stays one character however long the list gets. */}
                    <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 5, background: '#A5D8DD', color: '#000', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', textTransform: 'uppercase' }}>
                      {(c.businessName ?? c.fullName ?? '?').trim().charAt(0) || '?'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#000', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            {/* The heading names the client whose account is open. With none
                picked there is nothing to name, so it stays out of the way. */}
            {selectedId !== null && (
              <h1 style={{ margin: 0, fontFamily: "'Aptos', sans-serif", fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#1E8496' }}>
                {ledger?.client?.businessName ?? ledger?.client?.user?.fullName ?? 'Client Account'}
              </h1>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', minWidth: 0 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: P.textMuted, fontSize: 13, fontFamily: F }}>Loading…</div>
          ) : payClient ? (
            <ReceivePaymentPanel client={payClient} onClose={() => setPayClient(null)} onSaved={() => { setPayClient(null); refresh() }} />
          ) : applyPay ? (
            <ApplyCreditPanel payment={applyPay} onClose={() => setApplyPay(null)} onSaved={() => { setApplyPay(null); refresh() }} />
          ) : editPay ? (
            <ReceivePaymentPanel client={selectedClient ?? ledger?.client} payment={editPay}
              onClose={() => setEditPay(null)} onSaved={() => { setEditPay(null); refresh() }} />
          ) : editInv ? (
            <InvoiceFormPanel
              clientId={editInv.clientId}
              clientName={editInv.client?.businessName ?? editInv.client?.user?.fullName ?? 'Client'}
              inv={editInv}
              onClose={() => setEditInv(null)}
              onSaved={() => { setEditInv(null); refresh() }}
            />
          ) : showNewInvoice && (selectedClient ?? ledger?.client) ? (
            <InvoiceFormPanel
              clientId={(selectedClient ?? ledger?.client)?.id}
              clientName={(selectedClient ?? ledger?.client)?.businessName ?? (selectedClient ?? ledger?.client)?.user?.fullName ?? 'Client'}
              onClose={() => setShowNewInvoice(false)}
              onSaved={() => { setShowNewInvoice(false); refresh() }}
            />
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

                <PillSelect
                  value={range} onChange={v => setRange(v as RangeKey)} dimValue="all" minWidth={140}
                  options={RANGES.map(r => ({ value: r.key, label: r.label }))}
                />

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

                {ledger.client?.hasAnnualBilling && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: '#FDF0D5', color: '#B45309', flexShrink: 0 }}>
                    Annual {money(ledger.client.annualBillingAmount)}/yr
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

              {tab === 'history' && (() => {
                // Resolved once per row: a discount or withholding line belongs to
                // the payment that created it, so it acts on that payment rather
                // than on the invoice it settled.
                const payOf = (t: any) => t.paymentId ? ledger.payments?.find((p: any) => p.id === t.paymentId) : null
                const invOf = (t: any) => ledger.invoices?.find((i: Invoice) => i.invoiceNumber === t.ref)
                return (
                <DataTable
                  id="ledgerHistory" minWidth={980} rows={ledger.timeline} loading={false}
                  onRowContextMenu={(e: React.MouseEvent, t: any) => { const p = payOf(t); if (p) openPayMenu(e, p) }}
                  rowKey={(_t: any, i: number) => String(i)}
                  emptyText="Nothing billed to this client yet. Drafts appear under the Invoices tab."
                  columns={[
                    { key: 'date', label: 'Date', width: 108, cellStyle: { color: '#64748B' }, render: (t: any) => fmtDate(t.date) },
                    { key: 'type', label: 'Type', width: 96, render: (t: any) => {
                      const m = t.type === 'PAYMENT'     ? { label: 'Payment',  color: '#166534', bg: '#DCFCE7' }
                        : t.type === 'DISCOUNT'          ? { label: 'Discount', color: '#92400E', bg: '#FEF3C7' }
                        : t.type === 'WITHHOLDING'       ? { label: 'Withheld', color: '#92400E', bg: '#FEF3C7' }
                        : t.type === 'OPENING'           ? { label: 'Opening',  color: '#5C5C5C', bg: '#F1F5F9' }
                        : { label: 'Invoice', color: '#1E40AF', bg: '#DBEAFE' }
                      return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 800, color: m.color, background: m.bg }}>{m.label}</span>
                    } },
                    { key: 'ref', label: 'Reference', width: 128, cellStyle: { color: TEAL, fontWeight: 700 } },
                    { key: 'description', label: 'Description', width: 260, cellStyle: { fontWeight: 400 } },
                    { key: 'charge', label: 'Charge', width: 100, align: 'right', render: (t: any) => t.charge ? money(t.charge) : '' },
                    { key: 'credit', label: 'Payment', width: 100, align: 'right', cellStyle: { color: '#16a34a' }, render: (t: any) => t.credit ? money(t.credit) : '' },
                    { key: 'balance', label: 'Balance', width: 100, align: 'right',
                      render: (t: any) => <span style={{ color: t.balance > 0 ? '#D62828' : '#16a34a' }}>{money(t.balance)}</span> },
                    { key: 'actions', label: '', width: 92, resizable: false, cellStyle: { overflow: 'visible' }, render: (t: any) => {
                      const rowPay  = payOf(t)
                      const invMatch = invOf(t)
                      return (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {rowPay && Number(t.unapplied) > 0 && (
                            <button onClick={() => setApplyPay(rowPay)} title="Apply this unapplied credit to an invoice"
                              style={{ padding: '0 8px', height: 20, borderRadius: 6, border: 'none', background: '#7B2D8E', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                              Apply
                            </button>
                          )}
                          {rowPay ? (
                            <button onClick={() => setViewPay(rowPay)} title="View payment" style={eyeBtn}>{eyeIcon}</button>
                          ) : invMatch ? (
                            <button onClick={() => setViewInv(invMatch)} title="View / Print invoice" style={eyeBtn}>{eyeIcon}</button>
                          ) : null}
                          {rowPay ? (
                            <button onClick={() => setEditPay(rowPay)} title="Edit payment" style={pencilBtn}>{pencilIcon}</button>
                          ) : invMatch ? (
                            <button onClick={() => setEditInv(invMatch)} title="Edit invoice" style={pencilBtn}>{pencilIcon}</button>
                          ) : null}
                        </div>
                      )
                    } },
                  ]}
                />
                )
              })()}

              {tab === 'invoices' && (
                <DataTable
                  id="ledgerInvoices" minWidth={1000} rows={ledger.invoices} loading={false}
                  rowKey={(r: any) => r.id}
                  emptyText="No invoices for this client yet."
                  columns={[
                    { key: 'invoiceNumber', label: 'Invoice #', width: 118, cellStyle: { color: TEAL, fontWeight: 700 } },
                    { key: 'issueDate', label: 'Date', width: 104, cellStyle: { color: '#64748B' }, render: (r: any) => fmtDate(r.issueDate) },
                    { key: 'description', label: 'Description', width: 250, cellStyle: { fontWeight: 400 }, render: (r: any) => (
                      <>
                        {r.description ?? ''}
                        {r.kind === 'RETAINER' && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4, background: '#EDE9FE', color: '#5B21B6' }}>MONTHLY RETAINERSHIP</span>
                        )}
                        {r.kind === 'ANNUAL' && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4, background: '#FDF0D5', color: '#B45309' }}>ANNUAL RETAINERSHIP</span>
                        )}
                      </>
                    ) },
                    { key: 'service', label: 'Service', width: 118, cellStyle: { color: '#475569' },
                      render: (r: any) => SERVICE_LABEL[r.service] ?? '' },
                    { key: 'dueDate', label: 'Due Date', width: 104,
                      render: (r: any) => <span style={{ color: r.status === 'OVERDUE' ? '#D62828' : '#64748B' }}>{fmtDate(dueOf(r))}</span> },
                    { key: 'amount', label: 'Amount', width: 100, align: 'right', render: (r: any) => money(r.amount) },
                    { key: 'balance', label: 'Balance', width: 100, align: 'right',
                      render: (r: any) => <span style={{ color: balanceOf(r) > 0 ? '#D62828' : '#16a34a' }}>{money(balanceOf(r))}</span> },
                    { key: 'status', label: 'Status', width: 128, render: (r: any) => {
                      const st = STATUS_META[r.status] ?? STATUS_META.DRAFT
                      return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: st.color, background: st.bg }}>{st.label}</span>
                    } },
                    { key: 'actions', label: '', width: 70, resizable: false, cellStyle: { overflow: 'visible' }, render: (r: any) => actions(r) },
                  ]}
                />
              )}

              {tab === 'payments' && (
                <DataTable
                  id="ledgerPayments" minWidth={960} rows={ledger.payments} loading={false}
                  onRowContextMenu={(e: React.MouseEvent, p: any) => openPayMenu(e, p)}
                  rowKey={(p: any) => p.id}
                  emptyText="No payments from this client yet."
                  columns={[
                    { key: 'paidAt', label: 'Date', width: 108, cellStyle: { color: '#64748B' }, render: (p: any) => fmtDate(p.paidAt) },
                    { key: 'method', label: 'Method', width: 130, render: (p: any) => METHOD_LABEL[p.method] ?? p.method },
                    { key: 'reference', label: 'Reference', width: 160, cellStyle: { color: '#64748B', fontWeight: 400 }, render: (p: any) => (
                      <>
                        <span style={{ color: TEAL, fontWeight: 700 }}>{p.paymentNumber ?? ''}</span>
                        {p.reference ? <span style={{ marginLeft: 6 }}>{p.reference}</span> : null}
                      </>
                    ) },
                    { key: 'appliedTo', label: 'Applied To', width: 220, cellStyle: { fontWeight: 400 }, render: (p: any) => (
                      <>
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
                      </>
                    ) },
                    { key: 'amount', label: 'Received', width: 100, align: 'right', render: (p: any) => money(p.amount) },
                    { key: 'unapplied', label: 'Unapplied', width: 100, align: 'right',
                      render: (p: any) => <span style={{ color: p.unapplied > 0 ? '#5B21B6' : '#94A3B8' }}>{money(p.unapplied)}</span> },
                    { key: 'actions', label: '', width: 132, resizable: false, cellStyle: { overflow: 'visible' }, render: (p: any) => (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {p.unapplied > 0 && (
                          <button onClick={() => setApplyPay(p)} title="Apply this credit to an invoice"
                            style={{ padding: '0 8px', height: 20, borderRadius: 6, border: 'none', background: '#7B2D8E', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F }}>
                            Apply
                          </button>
                        )}
                        <button onClick={() => setViewPay(p)} title="View payment" style={eyeBtn}>{eyeIcon}</button>
                        <button onClick={() => setEditPay(p)} title="Edit payment" style={pencilBtn}>{pencilIcon}</button>
                      </div>
                    ) },
                  ]}
                />
              )}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {viewInv   && <InvoiceView inv={viewInv} onClose={() => setViewInv(null)} onDeleted={() => { setViewInv(null); refresh() }} onEdit={i => { setViewInv(null); setEditInv(i) }} onChanged={refresh} />}
      {openBal   && <OpeningBalanceModal client={openBal.client} mode={openBal.mode} onClose={() => setOpenBal(null)} onSaved={() => { setOpenBal(null); refresh() }} />}
      {viewPay   && <PaymentView payment={viewPay} onClose={() => setViewPay(null)} onEdit={() => { setEditPay(viewPay); setViewPay(null) }} />}

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

      {/* Right-click menu on a payment (Account History or Payments tab) */}
      {payMenu && (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: payMenu.y, left: payMenu.x, zIndex: 1200, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: 4, minWidth: 180 }}>
          {[
            { label: 'Edit payment',   danger: false, run: () => setEditPay(payMenu.payment) },
            { label: 'Delete payment', danger: true,  run: () => handleDeletePayment(payMenu.payment.id) },
          ].map(item => (
            <button key={item.label} onClick={() => { setPayMenu(null); item.run() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: item.danger ? '#DC2626' : NAVY, fontFamily: F, borderRadius: 6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.danger ? '#FEF2F2' : '#F1F5F9' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              {item.danger ? (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              ) : (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}

    </div>
  )
}

