'use client'

import { P } from '@/lib/palette'

export const NAVY = '#132E57'
export const TEAL = '#1E8496'
export const F    = "'Aptos', sans-serif"

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

export const money = (n: any) =>
  n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })

export const TASK_TYPES = [
  { value: 'EXTERNAL_AUDIT', label: 'External Audit' },
  { value: 'INTERNAL_AUDIT', label: 'Internal Audit' },
  { value: 'FS_PREPARATION', label: 'FS Preparation' },
  { value: 'GENERAL',        label: 'General Task' },
]

// ISA-shaped phases, in the order a file actually moves through them
export const PHASES = [
  { value: 'ACCEPTANCE', label: 'Acceptance' },
  { value: 'PLANNING',   label: 'Planning' },
  { value: 'FIELDWORK',  label: 'Fieldwork' },
  { value: 'REVIEW',     label: 'Review' },
  { value: 'COMPLETION', label: 'Completion' },
  { value: 'REPORTING',  label: 'Reporting' },
  { value: 'COMPLETED',  label: 'Completed' },
]
export const PHASE_LABEL: Record<string, string> = Object.fromEntries(PHASES.map(p => [p.value, p.label]))

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  IN_PROGRESS: { label: 'In Progress', color: '#92400E', bg: '#FEF3C7' },
  SENT_BACK:   { label: 'Sent Back',   color: '#991B1B', bg: '#FEE2E2' },
  COMPLETED:   { label: 'Completed',   color: '#166534', bg: '#DCFCE7' },
  CANCELLED:   { label: 'Cancelled',   color: '#5C5C5C', bg: '#F1F5F9' },
}

export const WP_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  NOT_STARTED:          { label: 'Not Started',   color: '#5C5C5C', bg: '#F1F5F9' },
  IN_PROGRESS:          { label: 'In Progress',   color: '#92400E', bg: '#FEF3C7' },
  AWAITING_DATA:        { label: 'Awaiting Data', color: '#5B21B6', bg: '#EDE9FE' },
  SUBMITTED_FOR_REVIEW: { label: 'Submitted',     color: '#1E40AF', bg: '#DBEAFE' },
  TEAM_LEAD_REVIEW:     { label: 'Team Lead Review', color: '#1E40AF', bg: '#DBEAFE' },
  MANAGER_REVIEW:       { label: 'Manager Review',   color: '#B45309', bg: '#FDF0D5' },
  SENT_BACK:            { label: 'Sent Back',     color: '#991B1B', bg: '#FEE2E2' },
  COMPLETED:            { label: 'Completed',     color: '#166534', bg: '#DCFCE7' },
}

export const AREA_GROUP_LABEL: Record<string, string> = {
  BALANCE_SHEET:   'Balance Sheet',
  PROFIT_AND_LOSS: 'Profit & Loss',
  OTHER:           'Other',
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

// The teal header every inline panel in the CRM uses, with its Back button
export function PanelHeader({ title, pill, right, onBack }: {
  title: string; pill?: string; right?: React.ReactNode; onBack: () => void
}) {
  return (
    <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: '#F1F5F9', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </h2>
        {pill && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, fontFamily: F, whiteSpace: 'nowrap' }}>
            {pill}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        {right}
        <button onClick={onBack} style={{
          cursor: 'pointer', color: '#E2E8F0', fontWeight: 700,
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 8, padding: '4px 12px', fontSize: 12, fontFamily: F,
        }}>
          ← Back
        </button>
      </div>
    </div>
  )
}
