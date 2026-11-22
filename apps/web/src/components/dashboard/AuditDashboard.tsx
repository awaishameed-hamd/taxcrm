'use client'

import { usePhone, useCompact } from '@/hooks/useMediaQuery'

// Same constants the tax dashboard uses, so the two pages share one look
const F      = "'Aptos',sans-serif"
const NAVY   = '#132E57'
const TEAL   = '#1E8496'
const GOLD   = '#D7A520'
const BRICK  = '#C25A1F'
const FOREST = '#3A6B3A'
const MUTED  = '#808080'
const SLATE  = '#5C5C5C'
const WHITE  = '#FFFFFF'
const BORDER = '#E0DDD5'

const titleStyle: React.CSSProperties = { color: NAVY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: F }

const TYPE_LABEL: Record<string, string> = {
  EXTERNAL_AUDIT: 'External Audit',
  INTERNAL_AUDIT: 'Internal Audit',
  FS_PREPARATION: 'FS Preparation',
  GENERAL:        'General Task',
}
const TYPE_COLOR: Record<string, string> = {
  EXTERNAL_AUDIT: TEAL, INTERNAL_AUDIT: '#7B2D8E', FS_PREPARATION: BRICK, GENERAL: '#64748B',
}
const PHASE_LABEL: Record<string, string> = {
  ACCEPTANCE: 'Acceptance', PLANNING: 'Planning', FIELDWORK: 'Fieldwork',
  REVIEW: 'Review', COMPLETION: 'Completion', REPORTING: 'Reporting', COMPLETED: 'Completed',
}
const PHASE_COLOR: Record<string, string> = {
  ACCEPTANCE: '#1565C0', PLANNING: TEAL, FIELDWORK: GOLD,
  REVIEW: '#7B2D8E', COMPLETION: BRICK, REPORTING: '#0F766E', COMPLETED: FOREST,
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  IN_PROGRESS: { label: 'In Progress', color: '#92400E', bg: '#FEF3C7' },
  SENT_BACK:   { label: 'Sent Back',   color: '#991B1B', bg: '#FEE2E2' },
  COMPLETED:   { label: 'Completed',   color: '#166534', bg: '#DCFCE7' },
  CANCELLED:   { label: 'Cancelled',   color: '#5C5C5C', bg: '#F1F5F9' },
}

// Lifted from the tax dashboard verbatim. Both departments sit under one firm,
// so a card here has to be indistinguishable from a card there.
function StatCard({ label, value, hint, breakdown, border, fill, textColor, loading }: {
  label: string; value: number | string; hint?: string
  breakdown?: { label: string; value: number }[]
  border: string; fill: string; textColor: string; loading: boolean
}) {
  return (
    <div style={{ background: `linear-gradient(135deg,${fill} 0%,#fff 100%)`, border: `1px solid ${border}33`, borderRadius: 8, padding: '14px 14px', height: 80, boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: MUTED, letterSpacing: '0.03em', fontWeight: 300, textTransform: 'uppercase', fontFamily: "'Ethnocentric Rg', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        {loading
          ? <div style={{ width: 55, height: 24, background: BORDER, borderRadius: 4, marginTop: 9 }} />
          : <div style={{ fontSize: 24, fontWeight: 700, color: textColor, marginTop: 9, lineHeight: 1, fontFamily: F }}>{value}</div>
        }
        {hint && <div style={{ fontSize: 9, color: MUTED, marginTop: 2, fontFamily: F }}>{hint}</div>}
      </div>
      {breakdown && !loading && breakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, paddingTop: 6, flexShrink: 0 }}>
          {breakdown.map((b, bi) => (
            <div key={bi} style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap', fontFamily: F }}>
              {b.label}&nbsp;&nbsp;<span style={{ fontWeight: 700, color: textColor }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// The same dotted-row box the tax dashboard uses for its breakdowns
function BreakdownBox({ title, rows, colorFn }: {
  title: string
  rows: { key: string; label: string; count: number }[]
  colorFn: (k: string) => string
}) {
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 14px 13px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={titleStyle}>{title}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: TEAL, background: '#E5F3F5', padding: '3px 10px', borderRadius: 20, fontFamily: F }}>TOTAL</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEAL, lineHeight: 1, fontFamily: F }}>{total}</span>
        </div>
        {rows.length === 0
          ? <div style={{ fontSize: 10, color: '#B8BFC9', fontStyle: 'italic', padding: '2px 2px 0', fontFamily: F }}>Nothing here yet</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {rows.map(r => {
                const c = colorFn(r.key)
                return (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 0 2.5px ${c}22`, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, color: SLATE, fontWeight: 600, fontFamily: F, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: c, fontFamily: F }}>{r.count}</span>
                  </div>
                )
              })}
            </div>
        }
      </div>
    </div>
  )
}

// The audit side's dashboard. Shown instead of the tax one, which counts sales
// tax returns and FBR notices and would read zero on every card here.
export default function AuditDashboard({ data, loading }: { data: any; loading: boolean }) {
  const phone   = usePhone()
  const compact = useCompact()
  const statCols = phone ? 'repeat(2,1fr)' : compact ? 'repeat(3,1fr)' : 'repeat(6,1fr)'
  const boxCols  = phone ? '1fr' : 'repeat(2,1fr)'

  const s      = data?.stats ?? {}
  const phases = data?.byPhase ?? []
  const types  = data?.byType ?? []
  const recent = data?.recentEngagements ?? []
  const total  = s.totalEngagements ?? 0

  return (
    <>
      {/* ── Row 1. Six stat cards, the same band the tax dashboard opens with ── */}
      <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: 10, marginBottom: 10 }}>
        <StatCard label="ENGAGEMENTS"  value={total}                     border={TEAL}      fill="#E5F3F5" textColor={TEAL}      loading={loading} />
        <StatCard label="IN PROGRESS"  value={s.inProgress ?? 0}         border={GOLD}      fill="#FEF3C7" textColor={GOLD}      loading={loading} />
        <StatCard label="SENT BACK"    value={s.sentBack ?? 0}           border="#DC2626"   fill="#FEE2E2" textColor="#DC2626"   loading={loading} />
        <StatCard label="COMPLETED"    value={s.completed ?? 0}          border={FOREST}    fill="#E7F4E7" textColor={FOREST}    loading={loading} />
        <StatCard label="WORKING PAPERS" value={s.openWorkingPapers ?? 0} border={BRICK}    fill="#F5E0D2" textColor={BRICK}     loading={loading}
          hint={`${s.myOpenWorkingPapers ?? 0} assigned to you`} />
        {/* The number that actually blocks a sign off, so it earns a card */}
        <StatCard label="REVIEW POINTS" value={s.openReviewPoints ?? 0}  border="#7B2D8E"   fill="#F3E8F7" textColor="#7B2D8E"   loading={loading}
          hint={`${s.teamCount ?? 0} in the audit team`} />
      </div>

      {/* ── Row 2. Breakdown boxes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: boxCols, gap: 10, marginBottom: 10, alignItems: 'stretch' }}>
        <BreakdownBox title="Engagements by Phase" colorFn={k => PHASE_COLOR[k] ?? TEAL}
          rows={phases.map((p: any) => ({ key: p.phase, label: PHASE_LABEL[p.phase] ?? p.phase, count: p.count }))} />
        <BreakdownBox title="Engagements by Type" colorFn={k => TYPE_COLOR[k] ?? TEAL}
          rows={types.map((t: any) => ({ key: t.type, label: TYPE_LABEL[t.type] ?? t.type, count: t.count }))} />
      </div>

      {/* ── Row 3. Recent engagements ── */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px 13px 14px' }}>
          <div style={{ ...titleStyle, marginBottom: 0 }}>Recent Engagements</div>
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
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((e: any) => {
                  const m = STATUS_META[e.status] ?? STATUS_META.IN_PROGRESS
                  const td: React.CSSProperties = { padding: '6px 12px', fontSize: 12, fontFamily: F, borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                  return (
                    <tr key={e.id} style={{ background: WHITE }}>
                      <td style={{ ...td, fontSize: 13, fontWeight: 700, color: NAVY }}>{e.client?.businessName ?? e.client?.user?.fullName ?? ''}</td>
                      <td style={td}>{e.title}</td>
                      <td style={{ ...td, color: '#475569' }}>{TYPE_LABEL[e.taskType] ?? e.taskType}</td>
                      <td style={{ ...td, color: '#475569' }}>{PHASE_LABEL[e.phase] ?? e.phase}</td>
                      <td style={{ ...td, color: '#475569' }}>{e.teamLead?.fullName ?? 'Not assigned'}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 5, display: 'inline-block' }}>{m.label}</span>
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
