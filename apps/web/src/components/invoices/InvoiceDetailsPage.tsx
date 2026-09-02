'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import PillSelect from '@/components/ui/PillSelect'
import DataTable from '@/components/ui/DataTable'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

const money   = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

// How an invoice stands today, which is not the same as its stored status: an
// invoice can be settled by discount or tax withheld at source without a rupee
// of cash arriving.
const BUCKETS = [
  { key: 'all',     label: 'All',           color: NAVY,      bg: '#E2E8F0' },
  { key: 'notdue',  label: 'Not Due',       color: '#1E40AF', bg: '#DBEAFE' },
  { key: 'overdue', label: 'Overdue',       color: '#991B1B', bg: '#FEE2E2' },
  { key: 'partial', label: 'Partially Paid',color: '#92400E', bg: '#FEF3C7' },
  { key: 'paid',    label: 'Paid',          color: '#166534', bg: '#DCFCE7' },
]
const BUCKET_META = Object.fromEntries(BUCKETS.map(b => [b.key, b]))

const KIND_META: Record<string, { label: string; color: string; bg: string }> = {
  TASK:     { label: 'Task',     color: '#1E40AF', bg: '#DBEAFE' },
  RETAINER: { label: 'Monthly Retainership', color: '#5B21B6', bg: '#EDE9FE' },
  ANNUAL:   { label: 'Annual Retainership',  color: '#B45309', bg: '#FDF0D5' },
  MANUAL:   { label: 'Manual',   color: '#5C5C5C', bg: '#F1F5F9' },
  OPENING:  { label: 'Opening',  color: '#0F766E', bg: '#CCFBF1' },
}

// Date presets over the invoice's issue date. Each returns [from, to] as
// yyyy-mm-dd, or null for no bound.
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const RANGES = [
  { key: 'all',       label: 'All Time'   },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisYear',  label: 'This Year'  },
  { key: 'custom',    label: 'Custom'     },
]

function rangeDates(key: string): { from?: string; to?: string } {
  const now = new Date()
  if (key === 'thisMonth') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  }
  if (key === 'lastMonth') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
  }
  if (key === 'thisYear') {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 11, 31)) }
  }
  return {}
}

function StatCard({ label, value, border, fill }: { label: string; value: string | number; border: string; fill: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827', fontFamily: F }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// ─── One invoice in full, inline in the right pane rather than a floating modal ──
function InvoiceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [inv,     setInv]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/invoices/${id}`)
      .then(({ data }) => setInv(data.data ?? data))
      .catch(() => setInv(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: P.textMuted, fontFamily: F }}>Loading…</div>
  }
  if (!inv) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: P.textMuted, fontFamily: F }}>
        Invoice not found. <button onClick={onBack} style={{ background: 0, border: 0, color: TEAL, cursor: 'pointer', fontWeight: 700 }}>Go back</button>
      </div>
    )
  }

  const settled = Number(inv.amountPaid) + Number(inv.discountTotal) + Number(inv.incomeTaxWithheld) + Number(inv.salesTaxWithheld)
  const balance = Number(inv.amount) - settled
  const km      = KIND_META[inv.kind] ?? KIND_META.MANUAL

  const line = (label: string, value: string, strong = false, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${P.gridLine}` }}>
      <span style={{ fontSize: 12, fontWeight: strong ? 800 : 600, color: strong ? NAVY : '#64748B', fontFamily: F }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: strong ? 900 : 700, color: color ?? (strong ? NAVY : '#1a1a1a'), fontFamily: F }}>{value}</span>
    </div>
  )

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
      <div style={{ background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.18)', border: 0, borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '5px 12px', fontFamily: F }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', fontFamily: F }}>{inv.invoiceNumber}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: F, marginTop: 1 }}>
            {inv.client?.businessName || inv.client?.user?.fullName || ''}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: km.bg, color: km.color }}>{km.label}</span>
      </div>

      <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: F, marginBottom: 6 }}>
            What was billed
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#1a1a1a', fontFamily: F, lineHeight: 1.5 }}>{inv.description ?? ''}</p>
          {line('Professional Fee', money(inv.subtotal))}
          {line('Sales Tax',        money(inv.salesTax))}
          {line('Out of Pocket',    money(inv.outOfPocket))}
          {line('Invoice Total',    money(inv.amount), true)}
          <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', fontFamily: F }}>Issued</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', fontFamily: F }}>{fmtDate(inv.issueDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', fontFamily: F }}>Due</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', fontFamily: F }}>{fmtDate(inv.dueDate) || 'Not set'}</div>
            </div>
          </div>
          {inv.notes && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#64748B', fontFamily: F, lineHeight: 1.5 }}>{inv.notes}</p>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: F, marginBottom: 6 }}>
            How it was settled
          </div>
          {line('Cash Received',       money(inv.amountPaid))}
          {line('Discount Allowed',    money(inv.discountTotal))}
          {line('Income Tax Withheld', money(inv.incomeTaxWithheld))}
          {line('Sales Tax Withheld',  money(inv.salesTaxWithheld))}
          {line('Total Settled',       money(settled), true, '#16a34a')}
          {line('Balance Due',         money(balance), true, balance > 0.001 ? '#D62828' : '#16a34a')}

          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5C5C5C', fontFamily: F, margin: '16px 0 6px' }}>
            Payments applied
          </div>
          {(inv.allocations ?? []).length === 0
            ? <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>Nothing applied yet.</p>
            : (inv.allocations ?? []).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: `1px solid ${P.gridLine}` }}>
                <span style={{ fontSize: 12, color: '#64748B', fontFamily: F }}>
                  {fmtDate(a.payment?.paidAt ?? a.createdAt)}
                  {a.payment?.method ? ` · ${String(a.payment.method).replace(/_/g, ' ').toLowerCase()}` : ''}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', fontFamily: F, whiteSpace: 'nowrap' }}>{money(a.amount)}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

export default function InvoiceDetailsPage() {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bucket,  setBucket]  = useState('all')
  const [range,   setRange]   = useState('all')
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [search,  setSearch]  = useState('')
  const [openId,  setOpenId]  = useState<string | null>(null)

  // Presets fill the two date boxes, Custom hands them back to the user
  const dates = useMemo(() => range === 'custom' ? { from: from || undefined, to: to || undefined } : rangeDates(range), [range, from, to])

  const fetchRows = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get('/invoices/register', { params: { ...dates, ...(search ? { search } : {}) } })
      .then(({ data }) => { const d = data.data ?? data; setRows(Array.isArray(d) ? d : []) })
      .catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [dates, search])

  useEffect(() => { fetchRows() }, [fetchRows])
  useAutoRefresh(() => fetchRows(true))

  // Buckets are filtered here rather than server-side, so switching a pill is
  // instant and the counts stay put instead of collapsing to the selected one.
  const visible = useMemo(() => bucket === 'all' ? rows : rows.filter(r => r.bucket === bucket), [rows, bucket])

  const counts = useMemo(() => ({
    all:     rows.length,
    notdue:  rows.filter(r => r.bucket === 'notdue').length,
    overdue: rows.filter(r => r.bucket === 'overdue').length,
    partial: rows.filter(r => r.bucket === 'partial').length,
    paid:    rows.filter(r => r.bucket === 'paid').length,
  } as Record<string, number>), [rows])

  // Money follows what is on screen, except Overdue which always reports the
  // whole range: it is the number the manager is chasing, not a view total.
  const totals = useMemo(() => ({
    invoiced: visible.reduce((s, r) => s + Number(r.amount), 0),
    settled:  visible.reduce((s, r) => s + Number(r.settled), 0),
    balance:  visible.reduce((s, r) => s + Number(r.balance), 0),
    overdue:  rows.filter(r => r.bucket === 'overdue').reduce((s, r) => s + Number(r.balance), 0),
  }), [visible, rows])

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, display: 'inline-block', color: TEAL }}>
          Invoicing Details
        </h1>
      </div>

      {openId ? (
        <InvoiceDetail id={openId} onBack={() => setOpenId(null)} />
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16, flexWrap: 'wrap' }}>
            <StatCard label="Invoices"       value={visible.length}       border="#1565C0" fill="#BDDAF8" />
            <StatCard label="Total Invoiced" value={money(totals.invoiced)} border="#132E57" fill="#CBD5E1" />
            <StatCard label="Settled"        value={money(totals.settled)}  border="#16A34A" fill="#BBF0D6" />
            <StatCard label="Balance Due"    value={money(totals.balance)}  border="#B45309" fill="#FBE3B8" />
            <StatCard label="Overdue"        value={money(totals.overdue)}  border="#DC2626" fill="#FECACA" />
          </div>

          {/* Status buckets + date range + search */}
          <div style={{ flexShrink: 0, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>
              {/* One dropdown instead of five pills, so the bar stays readable.
                  The count rides in the option text, which is where it was doing
                  its job anyway. */}
              <PillSelect
                value={bucket} onChange={setBucket} dimValue="all" minWidth={170}
                options={BUCKETS.map(b => ({ value: b.key, label: `${b.label} (${counts[b.key] ?? 0})` }))}
              />

              <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

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

              <div style={{ position: 'relative', flex: 1, minWidth: 150, maxWidth: 230 }}>
                <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input type="text" placeholder="Search client / invoice…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
              </div>
            </div>
          </div>

          <DataTable
            id="invoiceDetails" minWidth={940} rows={visible} loading={loading}
            rowKey={(r: any) => r.id} onRowClick={(r: any) => setOpenId(r.id)}
            emptyText={search
              ? `No invoices matching "${search}".`
              : 'No issued invoices in this range. An invoice shows up here the moment it is sent.'}
            columns={[
              { key: 'invoiceNumber', label: 'Invoice #', width: 108, cellStyle: { color: TEAL, fontWeight: 600 } },
              { key: 'clientName',    label: 'Client',    width: 180, cellStyle: { fontWeight: 600 } },
              { key: 'description',   label: 'Description', width: 240,
                render: (r: any) => r.description ?? '' },
              { key: 'kind', label: 'Type', width: 82, render: (r: any) => {
                const km = KIND_META[r.kind] ?? KIND_META.MANUAL
                return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 800, color: km.color, background: km.bg }}>{km.label}</span>
              } },
              { key: 'issueDate', label: 'Issued', width: 100, cellStyle: { color: '#64748B' },
                render: (r: any) => fmtDate(r.issueDate) },
              { key: 'dueDate', label: 'Due', width: 116, render: (r: any) => (
                <span style={{ color: r.bucket === 'overdue' ? '#D62828' : '#64748B' }}>
                  {fmtDate(r.dueDate) || 'Not set'}
                  {r.daysOverdue > 0 && <span style={{ fontWeight: 800 }}> · {r.daysOverdue}d</span>}
                </span>
              ) },
              { key: 'amount', label: 'Amount', width: 94, align: 'right',
                cellStyle: { fontWeight: 600 }, render: (r: any) => money(r.amount) },
              // Settled, not received: a discount or tax withheld at source closes
              // an invoice without any cash arriving.
              { key: 'settled', label: 'Settled', width: 94, align: 'right',
                cellStyle: { color: '#16a34a', fontWeight: 600 }, render: (r: any) => money(r.settled) },
              { key: 'balance', label: 'Balance', width: 94, align: 'right',
                render: (r: any) => <span style={{ color: r.balance > 0.001 ? '#D62828' : '#16a34a', fontWeight: 600 }}>{money(r.balance)}</span> },
              { key: 'bucket', label: 'Status', width: 120, render: (r: any) => {
                const bm = BUCKET_META[r.bucket] ?? BUCKET_META.notdue
                return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: bm.color, background: bm.bg }}>{bm.label}</span>
              } },
            ]}
          />
        </>
      )}
    </div>
  )
}
