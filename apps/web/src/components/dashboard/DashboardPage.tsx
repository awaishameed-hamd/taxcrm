'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'
import api from '@/lib/api'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { usePhone, useCompact } from '@/hooks/useMediaQuery'

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY   = '#132E57'
const TEAL   = '#1E8496'
const GOLD   = '#D7A520'
const BRICK  = '#C25A1F'
const FOREST = '#3A6B3A'
const KHAKI  = '#CBB26A'
const PURPLE = '#7B2D8E'
const MUTED  = '#808080'
const SLATE  = '#5C5C5C'
const LABEL  = '#5C5C5C'
const BG     = '#EDF0F3'
const WHITE  = '#FFFFFF'
const BORDER = '#E0DDD5'
const GRIDLN = '#F0EDE5'

const CHART_COLORS = [NAVY, TEAL, GOLD, KHAKI, BRICK, MUTED, PURPLE, FOREST]
const DONUT_TYPE   = [TEAL, NAVY, GOLD, BRICK]
const DONUT_FBR    = [TEAL, GOLD, BRICK, NAVY, FOREST]
const DONUT_GEN    = [MUTED, TEAL, FOREST]
const TREE_COLORS  = [NAVY, TEAL, GOLD, KHAKI, BRICK, FOREST, PURPLE, MUTED]

const F         = "'Aptos',sans-serif"
const cardStyle: React.CSSProperties = { background: WHITE, borderRadius: 8, padding: '12px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }
const titleStyle: React.CSSProperties = { color: NAVY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: F }

const PERIODS = [
  { key: 'overall', label: 'Overall'    },
  { key: 'daily',   label: 'Today'      },
  { key: 'weekly',  label: 'This Week'  },
  { key: 'monthly', label: 'This Month' },
]

const PIPELINE_ORDER = [
  { key: 'DATA_COLLECTION',    label: 'Data Collection',  color: '#64748B' },
  { key: 'DRAFT_PREPARATION',  label: 'Draft Prep',       color: '#6366F1' },
  { key: 'CLIENT_REVIEW',      label: 'Client Review',    color: '#8B5CF6' },
  { key: 'ANNEXURE_UPLOAD',    label: 'Annexure',         color: '#A78BFA' },
  { key: 'INCHARGE_REVIEW',    label: 'In-Charge Review', color: TEAL      },
  { key: 'CHALLAN_GENERATED',  label: 'Challan',          color: '#0EA5E9' },
  { key: 'SUBMISSION_APPROVAL',label: 'Sub. Approval',    color: GOLD      },
  { key: 'FILED',              label: 'Filed',            color: BRICK     },
  { key: 'COMPLETED',          label: 'Completed',        color: FOREST    },
  { key: 'SENT_BACK',          label: 'Sent Back',        color: '#DC2626' },
]

const PIPELINE_META: Record<string, string> = Object.fromEntries(PIPELINE_ORDER.map(p => [p.key, p.label]))

const TYPE_LABEL: Record<string, string> = { SALES_TAX: 'Sales Tax', INCOME_TAX: 'Income Tax', WHT: 'WHT' }
const FBR_LABEL:  Record<string, string> = { NOTICE: 'Notice', APPEAL: 'Appeal', STAY: 'Stay', HIGHER_FORUM: 'Higher Forum', CLOSED: 'Closed' }
const GEN_LABEL:  Record<string, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' }

const STATUS_COLOR: Record<string, string> = {
  DATA_COLLECTION:'#64748B', DRAFT_PREPARATION:'#6366F1', CLIENT_REVIEW:'#8B5CF6',
  ANNEXURE_UPLOAD:'#A78BFA', INCHARGE_REVIEW:TEAL, CHALLAN_GENERATED:'#0EA5E9',
  SUBMISSION_APPROVAL:GOLD, FILED:BRICK, COMPLETED:FOREST, SENT_BACK:'#DC2626',
}

// Pakistani tax authorities — federal (FBR) + provincial revenue boards
const AUTHORITY_META: Record<string, { label: string; color: string }> = {
  FBR:  { label: 'FBR',  color: NAVY   },
  PRA:  { label: 'PRA',  color: TEAL   },
  SRB:  { label: 'SRB',  color: GOLD   },
  KPRA: { label: 'KPRA', color: BRICK  },
  BRA:  { label: 'BRA',  color: FOREST },
  AJK:  { label: 'AJK',  color: PURPLE },
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Sk({ w='100%', h=18, r=6 }: { w?: string|number; h?: number; r?: number }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:'#E2E8F0', animation:'pulse 1.5s ease-in-out infinite' }} />
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, hint, breakdown, border, fill, textColor, loading }: {
  label: string; value: number|string; hint?: string
  breakdown?: { label: string; value: number }[]
  border: string; fill: string; textColor: string; loading: boolean
}) {
  return (
    <div style={{ background:`linear-gradient(135deg,${fill} 0%,#fff 100%)`, border:`1px solid ${border}33`, borderRadius:8, padding:'14px 14px', height:80, boxSizing:'border-box', display:'flex', justifyContent:'space-between', alignItems:'flex-start', overflow:'hidden' }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:9.5, color:MUTED, letterSpacing:'0.03em', fontWeight:300, textTransform:'uppercase', fontFamily:"'Ethnocentric Rg', sans-serif", whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
        {loading
          ? <div style={{ width:55, height:24, background:BORDER, borderRadius:4, marginTop:9 }} />
          : <div style={{ fontSize:24, fontWeight:700, color:textColor, marginTop:9, lineHeight:1, fontFamily:F }}>{value}</div>
        }
        {hint && <div style={{ fontSize:9, color:MUTED, marginTop:2, fontFamily:F }}>{hint}</div>}
      </div>
      {breakdown && !loading && breakdown.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, paddingTop:6, flexShrink:0 }}>
          {breakdown.map((b, bi) => (
            <div key={bi} style={{ fontSize:11, color:MUTED, whiteSpace:'nowrap', fontFamily:F }}>
              {b.label}&nbsp;&nbsp;<span style={{ fontWeight:700, color:textColor }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Donut — exact CC CRM VerticalDonut style ──────────────────────────────────
function Donut({ data, colors, centerLabel }: { data: { name:string; value:number }[]; colors: string[]; centerLabel: string }) {
  const compact = useCompact()
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:148, color:MUTED, fontSize:11, fontFamily:F }}>No data</div>
  return (
    // The chart is a fixed 148px and the legend refuses to wrap, so side by side
    // they overrun a phone-width card. Stack them instead of letting the legend
    // shove itself off the edge.
    <div style={{ display:'flex', gap:12, alignItems:'center', justifyContent:'center', flexWrap:'wrap' }}>
      <div style={{ position:'relative', width:148, height:148, flexShrink:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={46} outerRadius={68} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:6, fontSize:11 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:22, fontWeight:700, color:NAVY, lineHeight:1, fontFamily:F }}>{total}</div>
          <div style={{ fontSize:7.5, color:MUTED, letterSpacing:'0.08em', marginTop:2, fontFamily:F }}>{centerLabel}</div>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:0 }}>
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round(d.value / total * 100) : 0
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:LABEL, whiteSpace: compact ? 'normal' : 'nowrap', fontFamily:F }}>
              <span style={{ width:9, height:9, background:colors[i%colors.length], borderRadius:2, flexShrink:0 }} />
              <span>{d.name}</span>
              <span style={{ color:NAVY, fontWeight:700, marginLeft:3 }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Pipeline Funnel — horizontal progress bars (from v1) ──────────────────────
function PipelineFunnel({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (!total) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:148, color:MUTED, fontSize:11, fontFamily:F }}>No pipeline tasks yet</div>

  const rows = PIPELINE_ORDER.map(p => {
    const found = data.find(d => d.status === p.key)
    return { ...p, count: found?.count ?? 0 }
  }).filter(r => r.count > 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      {rows.map(r => {
        const pct = Math.round(r.count / total * 100)
        return (
          <div key={r.key} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ minWidth:110, fontSize:10, color:SLATE, fontWeight:600, fontFamily:F }}>{r.label}</span>
            <div style={{ flex:1, height:22, background:GRIDLN, borderRadius:4, overflow:'hidden', position:'relative' }}>
              <div style={{ width:`${Math.max(pct,2)}%`, height:'100%', background:r.color, borderRadius:4, transition:'width 0.5s ease', display:'flex', alignItems:'center', paddingLeft:7 }}>
                {pct >= 9 && <span style={{ fontSize:9, color:'#fff', fontWeight:700, fontFamily:F }}>{r.count}</span>}
              </div>
              {pct < 9 && <span style={{ position:'absolute', left:`calc(${pct}% + 6px)`, top:'50%', transform:'translateY(-50%)', fontSize:9, color:SLATE, fontWeight:700, fontFamily:F }}>{r.count}</span>}
            </div>
            <span style={{ minWidth:32, fontSize:10, fontWeight:700, color:r.color, textAlign:'right', fontFamily:F }}>{pct}%</span>
          </div>
        )
      })}
      <div style={{ marginTop:2, paddingTop:7, borderTop:`1px solid ${GRIDLN}`, display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:10, color:MUTED, fontFamily:F }}>Total pipeline tasks</span>
        <span style={{ fontSize:13, fontWeight:700, color:NAVY, fontFamily:F }}>{total}</span>
      </div>
    </div>
  )
}

// ── Pipeline Treemap — CC CRM SaleTypeTreemap style ───────────────────────────
function PipelineTreemap({ data }: { data: { status: string; count: number }[] }) {
  const filtered = data.filter(d => d.count > 0)
  const total    = filtered.reduce((s, d) => s + d.count, 0)
  if (!total) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:148, color:MUTED, fontSize:11, fontFamily:F }}>No pipeline tasks yet</div>
  return (
    <div style={{ display:'flex', height:148, gap:2, borderRadius:4, overflow:'hidden' }}>
      {filtered.map((d, i) => {
        const pct = Math.round(d.count / total * 100)
        return (
          <div key={d.status} style={{ flex:d.count, background:TREE_COLORS[i%TREE_COLORS.length], display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, minWidth:0, overflow:'hidden', padding:'0 2px' }}>
            <div style={{ fontSize:10, fontWeight:900, color:'#fff', textAlign:'center', lineHeight:1.2, wordBreak:'break-word' }}>{PIPELINE_META[d.status] ?? d.status}</div>
            <div style={{ fontSize:11, fontWeight:800, color:'rgba(255,255,255,0.85)' }}>{pct}%</div>
            <div style={{ fontSize:9, fontWeight:600, color:'rgba(255,255,255,0.65)' }}>{d.count}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Breakdown Box — Active (top) + Completed/Closed (bottom) ──────────────────
function BreakdownBox({ title, active, completed, labelFn, colorFn, completedLabel }: {
  title: string
  active: { key: string; count: number }[]
  completed: { key: string; count: number }[]
  labelFn: (k: string) => string
  colorFn: (k: string) => string
  completedLabel: string
}) {
  const Section = ({ heading, rows, accent, accentBg }: { heading: string; rows: { key:string; count:number }[]; accent: string; accentBg: string }) => {
    const total = rows.reduce((s, r) => s + r.count, 0)
    return (
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:9, fontWeight:800, letterSpacing:'0.08em', color:accent, background:accentBg, padding:'3px 10px', borderRadius:20, fontFamily:F }}>{heading}</span>
          <span style={{ fontSize:16, fontWeight:800, color:accent, lineHeight:1, fontFamily:F }}>{total}</span>
        </div>
        {rows.length === 0
          ? <div style={{ fontSize:10, color:'#B8BFC9', fontStyle:'italic', padding:'2px 2px 0', fontFamily:F }}>Nothing here yet</div>
          : <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {rows.map(r => {
                const c = colorFn(r.key)
                return (
                  <div key={r.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 0 2.5px ${c}22`, flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:11, color:SLATE, fontWeight:600, fontFamily:F, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{labelFn(r.key)}</span>
                    <span style={{ fontSize:11.5, fontWeight:800, color:c, fontFamily:F }}>{r.count}</span>
                  </div>
                )
              })}
            </div>
        }
      </div>
    )
  }
  return (
    <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'11px 14px 13px', display:'flex', flexDirection:'column', flex:1 }}>
        <div style={{ ...titleStyle, marginBottom:10, fontFamily:"'Aptos', sans-serif" }}>{title}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:11, flex:1 }}>
          <Section heading="ACTIVE" rows={active} accent={TEAL} accentBg="#E5F3F5" />
          <div style={{ borderTop:`1px dashed ${BORDER}` }} />
          <Section heading={completedLabel} rows={completed} accent={FOREST} accentBg="#E7F4E7" />
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props { title: string; subtitle: string }

export default function DashboardPage({ title }: Props) {
  const phone   = usePhone()
  const compact = useCompact()
  // Six stat cards across a 390px phone leaves ~55px each and the contents
  // collide. Two columns on a phone, three on a tablet, six on desktop.
  const statCols = phone ? 'repeat(2,1fr)' : compact ? 'repeat(3,1fr)' : 'repeat(6,1fr)'
  const boxCols  = phone ? '1fr' : compact ? 'repeat(2,1fr)' : 'repeat(4,1fr)'
  const donutCols = phone ? '1fr' : compact ? 'repeat(2,1fr)' : '1fr 1fr 1fr'
  const [period,  setPeriod]  = useState('overall')
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError('') }
    try {
      const params = period === 'overall' ? {} : { period }
      const { data: res } = await api.get('/dashboard/stats', { params })
      setData(res.data)
    } catch {
      if (!silent) setError('Failed to load dashboard data.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])
  useAutoRefresh(() => load(true))

  const stats       = data?.stats            ?? {}
  const byStatus    = data?.pipelineByStatus  ?? []
  const byType      = data?.pipelineByType    ?? []
  const fbrStages   = data?.fbrByStage        ?? []
  const genStatus   = data?.generalByStatus   ?? []
  const EMPTY_BOX = { active: [], completed: [] }
  const boxes = data?.boxes ?? { returns: EMPTY_BOX, salesByAuth: EMPTY_BOX, fbrByType: EMPTY_BOX, fbrByStage: EMPTY_BOX }

  const typeLabelFn  = (k: string) => TYPE_LABEL[k] ?? k
  const typeColorFn  = (k: string) => ({ SALES_TAX: TEAL, INCOME_TAX: NAVY, WHT: GOLD }[k] ?? MUTED)
  const authLabelFn  = (k: string) => AUTHORITY_META[k]?.label ?? k
  const authColorFn  = (k: string) => AUTHORITY_META[k]?.color ?? MUTED
  const stageLabelFn = (k: string) => FBR_LABEL[k] ?? k
  const stageColorFn = (k: string) => STATUS_COLOR[k] ?? ({ NOTICE:NAVY, APPEAL:PURPLE, STAY:GOLD, HIGHER_FORUM:BRICK }[k] ?? TEAL)
  const deadlines   = data?.deadlines          ?? { overdue:0, dueToday:0, dueThisWeek:0, upcoming:0, noDueDate:0 }
  const recentTasks = data?.recentTasks       ?? []
  const recentFbr   = data?.recentFbr         ?? []

  const typeDonut = byType.map((b: any) => ({ name: TYPE_LABEL[b.type]  ?? b.type,  value: b.count }))
  const fbrDonut  = fbrStages.map((b: any) => ({ name: FBR_LABEL[b.stage] ?? b.stage, value: b.count }))
  const genDonut  = genStatus.map((b: any) => ({ name: GEN_LABEL[b.status] ?? b.status, value: b.count }))

  const FBR_CHIP: Record<string, { c: string; bg: string }> = {
    NOTICE:{ c:NAVY, bg:'#E8EEF7' }, APPEAL:{ c:PURPLE, bg:'#EDE9FE' },
    STAY:{ c:GOLD, bg:'#FEF3C7' }, HIGHER_FORUM:{ c:BRICK, bg:'#F5E0D2' }, CLOSED:{ c:FOREST, bg:'#E7F4E7' },
  }

  return (
    <div style={{
      background:BG, minHeight:'100vh', boxSizing:'border-box', fontFamily:F,
      // The hamburger is pinned top-left on compact screens, so the heading
      // needs to start clear of it instead of underneath it.
      padding: phone ? '14px 12px 14px 58px' : '14px 18px',
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        {/* Faster One carries its own forward slant, so no skewX here — stacking the
            two made it lean over far enough to look like a mistake. */}
        <div style={{ fontSize: phone ? 26 : 34, color:NAVY, fontFamily:"'Faster One',cursive", display:'inline-block', letterSpacing:'0.01em', lineHeight:1.15 }}>{title}</div>
        <div style={{ display:'flex', gap:2, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:8, padding:3 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{ background:period===p.key ? NAVY : 'transparent', color:period===p.key ? '#fff' : SLATE, border:'none', padding:'5px 13px', borderRadius:6, fontSize:11, fontWeight:period===p.key ? 600 : 400, cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s', fontFamily:F }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#991B1B', marginBottom:10 }}>{error}</div>}

      {/* ── Row 1 — Stat Cards + Deadline bands (flat cards, numbers only) ── */}
      <div style={{ display:'grid', gridTemplateColumns:statCols, gap:10, marginBottom:10 }}>
        <StatCard label="RETURNS"           value={stats.activePipeline ?? 0}     border={TEAL}    fill="#E5F3F5" textColor={TEAL}    loading={loading} />
        <StatCard label="NOTICES & APPEALS" value={stats.activeFbr ?? 0}          border={BRICK}   fill="#F5E0D2" textColor={BRICK}   loading={loading} />
        <StatCard label="GENERAL TASKS"     value={stats.activeGeneral ?? 0}      border={GOLD}    fill="#FEF3C7" textColor={GOLD}    loading={loading} />
        <StatCard label="OVERDUE"           value={deadlines.overdue ?? 0}     border="#DC2626" fill="#FEE2E2" textColor="#DC2626" loading={loading} />
        <StatCard label="DUE TODAY"         value={deadlines.dueToday ?? 0}    border="#EA580C" fill="#FFEDD5" textColor="#EA580C" loading={loading} />
        <StatCard label="DUE THIS WEEK"     value={deadlines.dueThisWeek ?? 0} border={GOLD}    fill="#FEF3C7" textColor={GOLD}    loading={loading} />
      </div>

      {/* ── Row 2 — 4 breakdown boxes (Active top, Completed/Closed bottom) ── */}
      <div style={{ display:'grid', gridTemplateColumns:boxCols, gap:10, marginBottom:10, alignItems:'stretch' }}>
        <BreakdownBox title="Returns by Type"       active={boxes.returns.active}     completed={boxes.returns.completed}     labelFn={typeLabelFn}  colorFn={typeColorFn}  completedLabel="COMPLETED" />
        <BreakdownBox title="Sales Tax by Authority" active={boxes.salesByAuth.active} completed={boxes.salesByAuth.completed} labelFn={authLabelFn}  colorFn={authColorFn}  completedLabel="COMPLETED" />
        <BreakdownBox title="Notices & Appeals by Tax Type" active={boxes.fbrByType.active}   completed={boxes.fbrByType.completed}   labelFn={typeLabelFn}  colorFn={typeColorFn}  completedLabel="CLOSED" />
        <BreakdownBox title="Notices & Appeals by Stage"    active={boxes.fbrByStage.active}  completed={boxes.fbrByStage.completed}  labelFn={stageLabelFn} colorFn={stageColorFn} completedLabel="CLOSED" />
      </div>

      {/* ── Row 3 — Tax Authority + Pipeline Funnel ── */}
      <div style={{ marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Returns Status Breakdown</div>
          {loading
            ? <div style={{ display:'flex', flexDirection:'column', gap:7 }}>{[1,2,3,4,5,6].map(i=><Sk key={i} h={22}/>)}</div>
            : <PipelineFunnel data={byStatus} />
          }
        </div>
      </div>

      {/* ── Row 3 — All 3 Donuts ── */}
      <div style={{ display:'grid', gridTemplateColumns:donutCols, gap:10, marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Tasks by Type</div>
          {loading ? <Sk h={148} /> : <Donut data={typeDonut} colors={DONUT_TYPE} centerLabel="TASKS" />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Notices & Appeals by Stage</div>
          {loading ? <Sk h={148} /> : <Donut data={fbrDonut} colors={DONUT_FBR} centerLabel="CASES" />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>General Tasks</div>
          {loading ? <Sk h={148} /> : <Donut data={genDonut} colors={DONUT_GEN} centerLabel="TASKS" />}
        </div>
      </div>

      {/* ── Row 4 — Returns Distribution ── */}
      <div style={{ marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Returns Distribution</div>
          {loading ? <Sk h={148} /> : <PipelineTreemap data={byStatus} />}
        </div>
      </div>

    </div>
  )
}
