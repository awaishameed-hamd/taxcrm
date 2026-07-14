'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ComposedChart, Line, Bar,
  AreaChart, Area, RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

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

const F         = "'Aptos','Inter',sans-serif"
const cardStyle: React.CSSProperties = { background: WHITE, borderRadius: 8, padding: '12px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }
const titleStyle: React.CSSProperties = { color: NAVY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: F }
const ttipStyle = { contentStyle: { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11, color: NAVY }, labelStyle: { color: LABEL, fontWeight: 600 } }
const axisProps = { tick: { fill: LABEL, fontSize: 9 }, axisLine: false, tickLine: false }

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
    <div style={{ background:`linear-gradient(135deg,${fill} 0%,#fff 100%)`, borderLeft:`4px solid ${border}`, borderRadius:8, padding:'11px 14px', boxShadow:`0 1px 4px ${border}18`, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <div>
        <div style={{ fontSize:9, color:MUTED, letterSpacing:'0.08em', fontWeight:600, textTransform:'uppercase', fontFamily:F }}>{label}</div>
        {loading
          ? <div style={{ width:60, height:28, background:BORDER, borderRadius:4, marginTop:5 }} />
          : <div style={{ fontSize:26, fontWeight:700, color:textColor, marginTop:3, lineHeight:1, fontFamily:F }}>{value}</div>
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
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:148, color:MUTED, fontSize:11, fontFamily:F }}>No data</div>
  return (
    <div style={{ display:'flex', gap:12, alignItems:'center', justifyContent:'center' }}>
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
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round(d.value / total * 100) : 0
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:LABEL, whiteSpace:'nowrap', fontFamily:F }}>
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
            <div style={{ fontSize:10, fontWeight:900, color:GOLD, textAlign:'center', lineHeight:1.2, wordBreak:'break-word' }}>{PIPELINE_META[d.status] ?? d.status}</div>
            <div style={{ fontSize:11, fontWeight:800, color:'rgba(215,165,32,0.85)' }}>{pct}%</div>
            <div style={{ fontSize:9, fontWeight:600, color:'rgba(255,255,255,0.65)' }}>{d.count}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Completion Rate — radial gauge (modern KPI) ───────────────────────────────
function CompletionGauge({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round(completed / total * 100) : 0
  const gradId = 'compGauge'
  return (
    <div style={{ position:'relative', width:'100%', height:170, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: pct }]} startAngle={220} endAngle={-40}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor={TEAL} />
              <stop offset="100%" stopColor={FOREST} />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={12} fill={`url(#${gradId})`} background={{ fill: '#EEF1F4' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ fontSize:38, fontWeight:800, color:NAVY, lineHeight:1, fontFamily:F }}>{pct}<span style={{ fontSize:18, color:MUTED }}>%</span></div>
        <div style={{ fontSize:9, color:MUTED, letterSpacing:'0.1em', marginTop:4, fontFamily:F }}>COMPLETION RATE</div>
        <div style={{ fontSize:10, color:SLATE, marginTop:6, fontFamily:F }}>
          <span style={{ color:FOREST, fontWeight:700 }}>{completed}</span> of {total} done
        </div>
      </div>
    </div>
  )
}

// ── Tax Authority breakdown — horizontal bars (domain-unique) ─────────────────
function AuthorityChart({ data }: { data: { authority: string; count: number }[] }) {
  const rows = Object.keys(AUTHORITY_META)
    .map(k => ({ key: k, ...AUTHORITY_META[k], count: data.find(d => d.authority === k)?.count ?? 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
  const max = rows.length ? Math.max(...rows.map(r => r.count)) : 1
  if (!rows.length) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:170, color:MUTED, fontSize:11, fontFamily:F }}>No returns yet</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:11, paddingTop:6 }}>
      {rows.map(r => (
        <div key={r.key} style={{ display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ minWidth:42, fontSize:11, color:NAVY, fontWeight:700, fontFamily:F }}>{r.label}</span>
          <div style={{ flex:1, height:20, background:GRIDLN, borderRadius:5, overflow:'hidden' }}>
            <div style={{ width:`${Math.max(r.count / max * 100, 4)}%`, height:'100%', background:`linear-gradient(90deg, ${r.color}, ${r.color}cc)`, borderRadius:5, transition:'width 0.5s ease' }} />
          </div>
          <span style={{ minWidth:26, fontSize:12, fontWeight:800, color:r.color, textAlign:'right', fontFamily:F }}>{r.count}</span>
        </div>
      ))}
    </div>
  )
}

// ── Deadline Urgency Tracker — the standout CA-firm feature ────────────────────
function DeadlineTracker({ dl }: { dl: { overdue:number; dueToday:number; dueThisWeek:number; upcoming:number; noDueDate:number } }) {
  const bands = [
    { key:'overdue',     label:'Overdue',      value:dl.overdue,     color:'#DC2626', bg:'#FEE2E2', icon:'⚠' },
    { key:'dueToday',    label:'Due Today',    value:dl.dueToday,    color:'#EA580C', bg:'#FFEDD5', icon:'⏰' },
    { key:'dueThisWeek', label:'Due This Week',value:dl.dueThisWeek, color:GOLD,      bg:'#FEF3C7', icon:'📅' },
    { key:'upcoming',    label:'Upcoming',     value:dl.upcoming,    color:TEAL,      bg:'#E5F3F5', icon:'✓'  },
    { key:'noDueDate',   label:'No Due Date',  value:dl.noDueDate,   color:MUTED,     bg:'#F1F5F9', icon:'—'  },
  ]
  const totalActive = bands.reduce((s, b) => s + b.value, 0)
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:12 }}>
        {bands.map(b => (
          <div key={b.key} style={{ background:b.bg, borderRadius:8, padding:'10px 8px', textAlign:'center', border:`1px solid ${b.color}22` }}>
            <div style={{ fontSize:15, marginBottom:2 }}>{b.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:b.color, lineHeight:1, fontFamily:F }}>{b.value}</div>
            <div style={{ fontSize:9, color:SLATE, fontWeight:600, marginTop:4, letterSpacing:'0.02em', fontFamily:F }}>{b.label}</div>
          </div>
        ))}
      </div>
      {totalActive > 0 && (
        <div style={{ display:'flex', height:8, borderRadius:4, overflow:'hidden' }}>
          {bands.filter(b => b.value > 0).map(b => (
            <div key={b.key} style={{ flex:b.value, background:b.color }} title={`${b.label}: ${b.value}`} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Activity Trend — 7-day area chart (created vs completed) ───────────────────
function ActivityArea({ data }: { data: { date:string; created:number; completed:number }[] }) {
  const hasData = data.some(d => d.created > 0 || d.completed > 0)
  if (!hasData) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:170, color:MUTED, fontSize:11, fontFamily:F }}>No activity in the last 7 days</div>
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data} margin={{ top:6, right:8, left:-22, bottom:0 }}>
        <defs>
          <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEAL} stopOpacity={0.35} /><stop offset="100%" stopColor={TEAL} stopOpacity={0} /></linearGradient>
          <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOLD} stopOpacity={0.35} /><stop offset="100%" stopColor={GOLD} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRIDLN} vertical={false} />
        <XAxis dataKey="date" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip {...ttipStyle} />
        <Area type="monotone" dataKey="created"   name="Created"   stroke={TEAL} strokeWidth={2} fill="url(#gCreated)" />
        <Area type="monotone" dataKey="completed" name="Completed" stroke={GOLD} strokeWidth={2} fill="url(#gCompleted)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Monthly Filing Trend — 12-month area ──────────────────────────────────────
function MonthlyTrend({ data }: { data: { month:string; created:number; completed:number }[] }) {
  const hasData = data.some(d => d.created > 0 || d.completed > 0)
  if (!hasData) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:170, color:MUTED, fontSize:11, fontFamily:F }}>No filings recorded this year</div>
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top:6, right:8, left:-22, bottom:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRIDLN} vertical={false} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip {...ttipStyle} />
        <Bar dataKey="created"    name="Created"   fill={NAVY} radius={[3,3,0,0]} barSize={11} />
        <Line type="monotone" dataKey="completed" name="Completed" stroke={GOLD} strokeWidth={2.5} dot={{ r:2.5, fill:GOLD }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props { title: string; subtitle: string }

export default function DashboardPage({ title }: Props) {
  const { user } = useAuth()
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

  const role        = (user?.role ?? '').toString().toUpperCase()
  const isTrainee   = role === 'TRAINEE'

  const stats       = data?.stats            ?? {}
  const byStatus    = data?.pipelineByStatus  ?? []
  const byType      = data?.pipelineByType    ?? []
  const fbrStages   = data?.fbrByStage        ?? []
  const genStatus   = data?.generalByStatus   ?? []
  const byAuthority = data?.byAuthority        ?? []
  const deadlines   = data?.deadlines          ?? { overdue:0, dueToday:0, dueThisWeek:0, upcoming:0, noDueDate:0 }
  const monthly     = data?.monthlyTrend       ?? []
  const trend       = data?.trend             ?? []
  const topTrainees = data?.topTrainees       ?? []
  const recentTasks = data?.recentTasks       ?? []
  const recentFbr   = data?.recentFbr         ?? []

  // Completion rate — derived from pipeline status distribution
  const totalPipeline = byStatus.reduce((s: number, b: any) => s + b.count, 0)
  const completedCount = byStatus.find((b: any) => b.status === 'COMPLETED')?.count ?? 0

  const typeDonut = byType.map((b: any) => ({ name: TYPE_LABEL[b.type]  ?? b.type,  value: b.count }))
  const fbrDonut  = fbrStages.map((b: any) => ({ name: FBR_LABEL[b.stage] ?? b.stage, value: b.count }))
  const genDonut  = genStatus.map((b: any) => ({ name: GEN_LABEL[b.status] ?? b.status, value: b.count }))
  const periodLbl = period === 'daily' ? 'TODAY' : period === 'weekly' ? 'THIS WEEK' : period === 'monthly' ? 'THIS MONTH' : 'ALL TIME'

  const FBR_CHIP: Record<string, { c: string; bg: string }> = {
    NOTICE:{ c:NAVY, bg:'#E8EEF7' }, APPEAL:{ c:PURPLE, bg:'#EDE9FE' },
    STAY:{ c:GOLD, bg:'#FEF3C7' }, HIGHER_FORUM:{ c:BRICK, bg:'#F5E0D2' }, CLOSED:{ c:FOREST, bg:'#E7F4E7' },
  }

  return (
    <div style={{ background:BG, minHeight:'100vh', padding:'14px 18px', boxSizing:'border-box', fontFamily:F }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:22, color:NAVY, fontFamily:"'Angelos',sans-serif", display:'inline-block', transform:'skewX(12deg)' }}>{title}</div>
        <div style={{ display:'flex', gap:2, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:8, padding:3 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{ background:period===p.key ? NAVY : 'transparent', color:period===p.key ? '#fff' : SLATE, border:'none', padding:'5px 13px', borderRadius:6, fontSize:11, fontWeight:period===p.key ? 600 : 400, cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s', fontFamily:F }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#991B1B', marginBottom:10 }}>{error}</div>}

      {/* ── Row 1 — Stat Cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
        <StatCard label="TOTAL CLIENTS"       value={stats.totalClients ?? 0}       border={NAVY}   fill="#E8EEF7" textColor={NAVY}   loading={loading} />
        <StatCard label="ACTIVE RETURNS"      value={stats.activePipeline ?? 0}     border={TEAL}   fill="#E5F3F5" textColor={TEAL}   loading={loading}
          breakdown={byType.map((b:any)=>({ label:TYPE_LABEL[b.type]??b.type, value:b.count }))} />
        <StatCard label={`COMPLETED (${periodLbl})`} value={stats.completedInPeriod ?? 0} border={GOLD}   fill="#FEF3C7" textColor={GOLD}   loading={loading} hint="Returns completed" />
        <StatCard label="ACTIVE FBR CASES"    value={stats.activeFbr ?? 0}          border={BRICK}  fill="#F5E0D2" textColor={BRICK}  loading={loading}
          breakdown={fbrStages.slice(0,3).map((b:any)=>({ label:FBR_LABEL[b.stage]??b.stage, value:b.count }))} />
      </div>

      {/* ── Row 2 — Deadline Urgency Tracker (standout) ── */}
      <div style={{ ...cardStyle, marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
          <div style={titleStyle}>{isTrainee ? 'My Deadline Radar' : 'Deadline Radar — Active Returns'}</div>
          <div style={{ fontSize:9, color:MUTED, fontFamily:F }}>live snapshot · not affected by period filter</div>
        </div>
        {loading ? <Sk h={110} /> : <DeadlineTracker dl={deadlines} />}
      </div>

      {/* ── Row 3 — Completion Gauge + Tax Authority + Pipeline Funnel ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.3fr', gap:10, marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Completion Rate</div>
          {loading ? <Sk h={170} /> : <CompletionGauge completed={completedCount} total={totalPipeline} />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>By Tax Authority</div>
          {loading ? <Sk h={170} /> : <AuthorityChart data={byAuthority} />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Returns Status Breakdown</div>
          {loading
            ? <div style={{ display:'flex', flexDirection:'column', gap:7 }}>{[1,2,3,4,5,6].map(i=><Sk key={i} h={22}/>)}</div>
            : <PipelineFunnel data={byStatus} />
          }
        </div>
      </div>

      {/* ── Row 4 — Activity trend (7-day) + Monthly filing trend ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={titleStyle}>Activity — Last 7 Days</div>
            <div style={{ display:'flex', gap:12 }}>
              {[[TEAL,'Created'],[GOLD,'Completed']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9, color:LABEL, fontFamily:F }}>
                  <span style={{ width:8, height:8, background:c, borderRadius:2, display:'inline-block' }} />{l}
                </div>
              ))}
            </div>
          </div>
          {loading ? <Sk h={170} /> : <ActivityArea data={trend} />}
        </div>
        <div style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={titleStyle}>Monthly Filing Trend</div>
            <div style={{ display:'flex', gap:12 }}>
              {[[NAVY,'Created'],[GOLD,'Completed']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9, color:LABEL, fontFamily:F }}>
                  <span style={{ width:8, height:8, background:c, borderRadius:2, display:'inline-block' }} />{l}
                </div>
              ))}
            </div>
          </div>
          {loading ? <Sk h={170} /> : <MonthlyTrend data={monthly} />}
        </div>
      </div>

      {/* ── Row 3 — All 3 Donuts ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Tasks by Type</div>
          {loading ? <Sk h={148} /> : <Donut data={typeDonut} colors={DONUT_TYPE} centerLabel="TASKS" />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>FBR Cases by Stage</div>
          {loading ? <Sk h={148} /> : <Donut data={fbrDonut} colors={DONUT_FBR} centerLabel="CASES" />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>General Tasks</div>
          {loading ? <Sk h={148} /> : <Donut data={genDonut} colors={DONUT_GEN} centerLabel="TASKS" />}
        </div>
      </div>

      {/* ── Row 4 — Returns Distribution + Returns by Type ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Returns Distribution</div>
          {loading ? <Sk h={148} /> : <PipelineTreemap data={byStatus} />}
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Returns by Type</div>
          {loading ? <Sk h={148} /> : byType.length === 0
            ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:148, color:MUTED, fontSize:11, fontFamily:F }}>No data</div>
            : (
              <ResponsiveContainer width="100%" height={148}>
                <ComposedChart data={byType.map((b:any) => ({ name: TYPE_LABEL[b.type] ?? b.type, count: b.count }))} margin={{ top:6, right:8, left:-22, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRIDLN} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip {...ttipStyle} />
                  <Bar dataKey="count" name="Returns" radius={[4,4,0,0]} barSize={36}>
                    {byType.map((_:any, i:number) => <Cell key={i} fill={[TEAL, NAVY, GOLD][i % 3]} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* ── Row — Trainee Performance (team roles only) ── */}
      {!isTrainee && (
      <div style={{ marginBottom:10 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>{role === 'TEAM_LEAD' ? 'My Team: Completed vs Pending' : 'Trainee Performance: Completed vs Pending'}</div>
          {loading ? <Sk h={200} /> : topTrainees.length === 0
            ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:MUTED, fontSize:11, fontFamily:F }}>No data</div>
            : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart
                    data={topTrainees.map((t:any) => ({ name: t.name.split(' ')[0], completed: t.completed, pending: t.pending }))}
                    margin={{ top:6, right:12, left:-18, bottom:0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRIDLN} vertical={false} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip {...ttipStyle} />
                    <Bar dataKey="completed" name="Completed" fill={GOLD}    radius={[3,3,0,0]} barSize={18} />
                    <Bar dataKey="pending"   name="Pending"   fill={BRICK}   radius={[3,3,0,0]} barSize={18} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display:'flex', gap:16, marginTop:4, paddingTop:6, borderTop:`1px solid ${GRIDLN}` }}>
                  {[[GOLD,'Completed'],[BRICK,'Pending']].map(([c,l]) => (
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:LABEL }}>
                      <span style={{ width:8, height:8, background:c, borderRadius:2, display:'inline-block' }} />{l}
                    </div>
                  ))}
                </div>
              </>
            )
          }
        </div>
      </div>
      )}

    </div>
  )
}
