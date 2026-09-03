'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { uploadFile } from '@/lib/storage'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'

export const NAVY = '#132E57'
export const TEAL = '#1E8496'
export const F    = "'Aptos', sans-serif"

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:             { label: 'Draft',          color: '#5C5C5C', bg: '#F1F5F9' },
  SENT:              { label: 'Sent',           color: '#1E40AF', bg: '#DBEAFE' },
  OVERDUE:           { label: 'Overdue',        color: '#991B1B', bg: '#FEE2E2' },
  PARTIALLY_PAID:    { label: 'Partially Paid', color: '#92400E', bg: '#FEF3C7' },
  PAID:              { label: 'Paid',           color: '#166534', bg: '#DCFCE7' },
  RETAINER_INCLUDED: { label: 'In Monthly Retainership', color: '#5B21B6', bg: '#EDE9FE' },
  ANNUAL_INCLUDED:   { label: 'In Annual Retainership',  color: '#B45309', bg: '#FDF0D5' },
  CANCELLED:         { label: 'Cancelled',      color: '#991B1B', bg: '#FEE2E2' },
}

export const PAYMENT_METHODS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'CHEQUE',        label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'ONLINE',        label: 'Online' },
  { value: 'OTHER',         label: 'Other' },
]
export const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]))

export const money   = (n: any) => Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Loads an image and returns it as a data URL with its pixel size, for jsPDF.
export function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number }> {
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
export const dueOf = (i: any): string | null => {
  if (i.dueDate) return i.dueDate
  if (!i.issueDate) return null
  const d = new Date(i.issueDate)
  d.setDate(d.getDate() + 7)
  return d.toISOString()
}

// What's still owed. Cash isn't the only thing that closes an invoice. A discount or
// tax the client withheld at source settles it just the same.
export const balanceOf = (i: any) =>
  Number(i.amount) - Number(i.amountPaid ?? 0) - Number(i.discountTotal ?? 0)
  - Number(i.incomeTaxWithheld ?? 0) - Number(i.salesTaxWithheld ?? 0)

export const iso = (d: Date) => d.toISOString().split('T')[0]

// Date-range presets for the ledger. `null` means unbounded, the account from day one.
export type RangeKey = 'month' | 'year' | 'all' | 'custom'
// Row actions, shared so a View or an Edit looks the same on every ledger tab
export const eyeBtn: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 6, border: '1px solid #E0DDD5', background: '#fff',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#132E57',
}
export const pencilBtn: React.CSSProperties = { ...eyeBtn, color: '#3B82F6' }
export const eyeIcon = (
  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
)
export const pencilIcon = (
  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
  </svg>
)

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month',  label: 'This Month' },
  { key: 'year',   label: 'This Year' },
  { key: 'all',    label: 'All Time' },
  { key: 'custom', label: 'Custom' },
]
export function rangeBounds(key: RangeKey): { from?: string; to?: string } {
  const now = new Date()
  if (key === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),  to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (key === 'year')  return { from: iso(new Date(now.getFullYear(), 0, 1)),               to: iso(new Date(now.getFullYear(), 11, 31)) }
  return {}
}

export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${P.border}`, fontSize: 13, outline: 'none', fontFamily: F,
}
export const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#5C5C5C', marginBottom: 4, fontFamily: F,
}
export const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 700, fontFamily: F, background: bg, color,
})

export type Invoice = any

// ─── Stat card (same design as Attendance Approval) ───────────────────────────
export function StatCard({ label, value, border, fill }: { label: string; value: string | number; border: string; fill: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827', fontFamily: '"Aptos", sans-serif' }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// ─── Receive Payment (QuickBooks-style) ───────────────────────────────────────
// Renders inline in the right pane, like the Attendance Report calendar, not as an overlay.
export type Adj = { amount: string; discount: string; incomeTaxWithheld: string; salesTaxWithheld: string }
export const blankAdj = (): Adj => ({ amount: '', discount: '', incomeTaxWithheld: '', salesTaxWithheld: '' })
export const adjNum   = (a: Adj | undefined, k: keyof Adj) => Number(a?.[k]) || 0
export const adjTotal = (a: Adj | undefined) => adjNum(a, 'amount') + adjNum(a, 'discount') + adjNum(a, 'incomeTaxWithheld') + adjNum(a, 'salesTaxWithheld')

// Receive a payment, or edit one already recorded. Editing is the same screen on
// purpose: moving a payment booked against the wrong invoice is the same act as
// deciding where it goes in the first place.
