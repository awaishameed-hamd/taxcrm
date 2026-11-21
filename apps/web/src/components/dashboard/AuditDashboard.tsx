'use client'

import { P } from '@/lib/palette'

const F     = "'Aptos', sans-serif"
const NAVY  = '#132E57'
const TEAL  = '#1E8496'
const WHITE = '#fff'

const TYPE_LABEL: Record<string, string> = {
  EXTERNAL_AUDIT: 'External Audit',
  INTERNAL_AUDIT: 'Internal Audit',
  FS_PREPARATION: 'FS Preparation',
  GENERAL:        'General Task',
}
const PHASE_LABEL: Record<string, string> = {
  ACCEPTANCE: 'Acceptance', PLANNING: 'Planning', FIELDWORK: 'Fieldwork',
  REVIEW: 'Review', COMPLETION: 'Completion', REPORTING: 'Reporting', COMPLETED: 'Completed',
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  IN_PROGRESS: { label: 'In Progress', color: '#92400E', bg: '#FEF3C7' },
  SENT_BACK:   { label: 'Sent Back',   color: '#991B1B', bg: '#FEE2E2' },
  COMPLETED:   { label: 'Completed',   color: '#166534', bg: '#DCFCE7' },
  CANCELLED:   { label: 'Cancelled',   color: '#5C5C5C', bg: '#F1F5F9' },
}

function Card({ label, value, border, fill, textColor }: {
  label: string; value: number | string; border: string; fill: string; textColor: string
}) {
  return (
    <div style={{ background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: textColor, fontFamily: F }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

// A breakdown bar, used for both phase and task type
function Breakdown({ title, rows, total }: { title: string; rows: { label: string; count: number }[]; total: number }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${P.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F, marginBottom: 10 }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>Nothing yet.</p>
      ) : rows.map(r => (
        <div key={r.label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: F, marginBottom: 3 }}>
            <span style={{ color: NAVY, fontWeight: 600 }}>{r.label}</span>
            <span style={{ color: '#64748B', fontWeight: 700 }}>{r.count}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden' }}>
            <div style={{ width: `${total ? Math.round((r.count / total) * 100) : 0}%`, height: '100%', background: TEAL }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// The audit side's dashboard. Shown instead of the tax one, which counts sales
// tax returns and FBR notices and would read zero on every card here.
export default function AuditDashboard({ data, loading }: { data: any; loading: boolean }) {
  const s      = data?.stats ?? {}
  const phases = data?.byPhase ?? []
  const types  = data?.byType ?? []
  const recent = data?.recentEngagements ?? []
  const total  = s.totalEngagements ?? 0

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
        <Card label="ENGAGEMENTS"      value={loading ? '…' : total}                        border="#1565C0" fill="#BDDAF8" textColor="#1565C0" />
        <Card label="IN PROGRESS"      value={loading ? '…' : (s.inProgress ?? 0)}          border="#F2AC18" fill="#FBE3B8" textColor="#B45309" />
        <Card label="SENT BACK"        value={loading ? '…' : (s.sentBack ?? 0)}            border="#DC2626" fill="#FECACA" textColor="#DC2626" />
        <Card label="COMPLETED"        value={loading ? '…' : (s.completed ?? 0)}           border="#16A34A" fill="#BBF0D6" textColor="#166534" />
        <Card label="OPEN WORKING PAPERS" value={loading ? '…' : (s.openWorkingPapers ?? 0)} border={TEAL}   fill="#E5F3F5" textColor={TEAL} />
        {/* The number that actually blocks sign offs, so it earns a card */}
        <Card label="OPEN REVIEW POINTS"  value={loading ? '…' : (s.openReviewPoints ?? 0)} border="#7B2D8E" fill="#E4D4EC" textColor="#7B2D8E" />
        <Card label="MY WORKING PAPERS"   value={loading ? '…' : (s.myOpenWorkingPapers ?? 0)} border="#0F766E" fill="#CCFBF1" textColor="#0F766E" />
        <Card label="AUDIT TEAM"          value={loading ? '…' : (s.teamCount ?? 0)}        border="#64748B" fill="#E2E8F0" textColor="#475569" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 10 }}>
        <Breakdown title="BY PHASE" total={total}
          rows={phases.map((p: any) => ({ label: PHASE_LABEL[p.phase] ?? p.phase, count: p.count }))} />
        <Breakdown title="BY TYPE" total={total}
          rows={types.map((t: any) => ({ label: TYPE_LABEL[t.type] ?? t.type, count: t.count }))} />
      </div>

      <div style={{ background: WHITE, border: `1px solid ${P.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${P.border}`, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F }}>
          RECENT ENGAGEMENTS
        </div>
        {recent.length === 0 ? (
          <p style={{ margin: 0, padding: '28px 14px', textAlign: 'center', fontSize: 13, color: '#94A3B8', fontFamily: F }}>
            No engagements yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: '#F2AC18' }}>
                  {['Client', 'Engagement', 'Type', 'Phase', 'Team Lead', 'Status'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((e: any, i: number) => {
                  const m = STATUS_META[e.status] ?? STATUS_META.IN_PROGRESS
                  const td: React.CSSProperties = { padding: '6px 12px', fontSize: 12, fontFamily: F, borderBottom: `1px solid ${P.border}50`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                  return (
                    <tr key={e.id} style={{ background: i % 2 === 0 ? WHITE : '#FAFCFC' }}>
                      <td style={{ ...td, fontWeight: 700, color: NAVY }}>{e.client?.businessName ?? e.client?.user?.fullName ?? ''}</td>
                      <td style={td}>{e.title}</td>
                      <td style={{ ...td, color: '#475569' }}>{TYPE_LABEL[e.taskType] ?? e.taskType}</td>
                      <td style={{ ...td, color: '#475569' }}>{PHASE_LABEL[e.phase] ?? e.phase}</td>
                      <td style={{ ...td, color: '#475569' }}>{e.teamLead?.fullName ?? 'Not assigned'}</td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: m.color, background: m.bg }}>{m.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
