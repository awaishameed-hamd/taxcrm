'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import PillSelect from '@/components/ui/PillSelect'
import EngagementDetail from './EngagementDetail'
import NewEngagementPanel from './NewEngagementPanel'
import { F, NAVY, TEAL, STATUS_META, PHASE_LABEL, PHASES, fmtDate } from './auditShared'

// The same five-pill shape Tasks uses, so the two departments read as one app.
// Colours come from the same family: each tab owns one, the rail under the pills
// shows them all, and the active one fills.
const AUDIT_TABS = [
  { key: 'EXTERNAL_AUDIT', label: 'External Audit', color: '#1E8496', bg: '#E5F3F5' },
  { key: 'INTERNAL_AUDIT', label: 'Internal Audit', color: '#7B2D8E', bg: '#F3E8F7' },
  { key: 'FS_PREPARATION', label: 'FS Preparation', color: '#C25A1F', bg: '#F5E0D2' },
  { key: 'GENERAL',        label: 'General Tasks',  color: '#374151', bg: '#F3F4F6' },
]

const TAB_KEY = 'auditActiveTab'

export default function AuditPage({ approvalOnly = false, completedOnly = false, incompleteOnly = false, deptSwitch }: {
  approvalOnly?: boolean; completedOnly?: boolean; incompleteOnly?: boolean; deptSwitch?: React.ReactNode
}) {
  const { user } = useAuth()
  const isManager = ['ADMIN', 'PARTNER', 'MANAGER'].includes(String(user?.role))

  const [activeTab, setActiveTab] = useState('EXTERNAL_AUDIT')
  const [rows,      setRows]      = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<string | null>(null)
  const [creating,  setCreating]  = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Filters, only on the Completed and Incomplete lists, same set Tasks carries
  const [filterLead,   setFilterLead]   = useState('all')
  const [filterPhase,  setFilterPhase]  = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTime,   setFilterTime]   = useState<'all' | 'this_month' | 'this_year' | 'custom'>('all')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  // The tab is remembered per view, so Completed does not drag the tab you were
  // last on in Tasks along with it
  const tabKey = completedOnly ? `${TAB_KEY}_completed` : incompleteOnly ? `${TAB_KEY}_incomplete` : TAB_KEY

  // Remember the tab between visits, the way Tasks does
  useEffect(() => {
    try { const t = sessionStorage.getItem(tabKey); if (t) setActiveTab(t) } catch { /* private mode */ }
  }, [tabKey])

  const fetchRows = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get('/audit/engagements')
      .then(({ data }) => setRows((data.data ?? data) || []))
      .catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])
  useAutoRefresh(() => fetchRows(true))

  // Approval holds what is waiting on a manager; Completed holds what is signed
  // off. Neither is a different page, just a different slice, same as Tasks.
  const forView = useMemo(() => rows.filter(r => {
    if (approvalOnly)  return (r.workingPapers ?? []).some((w: any) => w.status === 'MANAGER_REVIEW') || r.openReviewPoints > 0
    if (completedOnly) return r.status === 'COMPLETED'
    return r.status !== 'COMPLETED'
  }), [rows, approvalOnly, completedOnly])

  // Team leads on the engagements in view, for the filter dropdown
  const leadOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of forView) if (r.teamLead?.id) m.set(r.teamLead.id, r.teamLead.fullName)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [forView])

  // A completed engagement is dated by its sign off, an open one by its year end
  const inTimeRange = useCallback((d?: string | null) => {
    if (filterTime === 'all') return true
    if (!d) return false
    const dt  = new Date(d)
    const now = new Date()
    if (filterTime === 'this_month') return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
    if (filterTime === 'this_year')  return dt.getFullYear() === now.getFullYear()
    if (filterFrom && dt < new Date(filterFrom)) return false
    if (filterTo) { const to = new Date(filterTo); to.setHours(23, 59, 59, 999); if (dt > to) return false }
    return true
  }, [filterTime, filterFrom, filterTo])

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of forView) c[r.taskType] = (c[r.taskType] ?? 0) + 1
    return c
  }, [forView])

  const listed = useMemo(() => {
    const q       = search.trim().toLowerCase()
    const isList  = completedOnly || incompleteOnly
    return forView
      .filter(r => r.taskType === activeTab)
      .filter(r => !q
        || r.title?.toLowerCase().includes(q)
        || r.client?.businessName?.toLowerCase().includes(q)
        || r.client?.user?.fullName?.toLowerCase().includes(q))
      .filter(r => {
        if (!isList) return true
        if (filterLead  !== 'all' && r.teamLead?.id !== filterLead) return false
        if (filterPhase !== 'all' && r.phase !== filterPhase) return false
        if (incompleteOnly && filterStatus !== 'all') {
          if (filterStatus === 'sentback'   && r.status !== 'SENT_BACK')   return false
          if (filterStatus === 'inprogress' && r.status !== 'IN_PROGRESS') return false
        }
        return inTimeRange(completedOnly ? (r.signedOffAt ?? r.completedAt) : r.periodEndDate)
      })
  }, [forView, activeTab, search, completedOnly, incompleteOnly,
      filterLead, filterPhase, filterStatus, inTimeRange])

  const current = listed.find(r => r.id === selected) ?? null
  const tabCfg  = AUDIT_TABS.find(t => t.key === activeTab)!

  if (creating) {
    return <NewEngagementPanel onClose={() => setCreating(false)} onSaved={id => { setCreating(false); fetchRows(); setSelected(id) }} />
  }

  // ── Pills row, lifted from Tasks so the two look identical ────────────────
  const PillsRow = (
    <div style={{ flexShrink: 0, overflow: 'visible' }}>
      {/* The department switch shares this row so the band keeps its height. If
          the two together outgrow the screen the row scrolls sideways rather
          than wrapping and pushing everything down. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: deptSwitch ? 'safe center' : 'center', padding: '14px 24px 8px', background: '#f7f8fa', overflowX: deptSwitch ? 'auto' : 'visible', overflowY: deptSwitch ? 'hidden' : 'visible' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3, overflow: 'visible', flexShrink: 0 }}>
          {AUDIT_TABS.map(tab => {
            const active = activeTab === tab.key
            const cnt    = tabCounts[tab.key] ?? 0
            return (
              <button key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelected(null); try { sessionStorage.setItem(tabKey, tab.key) } catch {} }}
                style={{ flexShrink: 0, paddingTop: 5, paddingBottom: 5, paddingLeft: 14, paddingRight: cnt > 0 ? 4 : 14, borderRadius: 6, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: active ? 700 : 500, transition: 'all .15s', border: 'none', background: active ? tab.color : 'transparent', color: active ? '#fff' : '#5C5C5C', whiteSpace: 'nowrap', display: 'flex', alignItems: 'stretch', gap: 5 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>{tab.label}</span>
                {cnt > 0 && (
                  <span style={{
                    background: active ? 'rgba(255,255,255,0.25)' : tab.color,
                    color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '0 6px', borderRadius: 3, lineHeight: 1,
                    display: 'flex', alignItems: 'center',
                  }}>{cnt > 99 ? '99+' : cnt}</span>
                )}
              </button>
            )
          })}
        </div>
        {deptSwitch}
      </div>
      <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3, flexShrink: 0 }}>
        {AUDIT_TABS.map(tab => (
          <div key={tab.key} style={{ flex: 1, background: tab.color, borderRadius: 2, opacity: activeTab === tab.key ? 1 : 0.35, transition: 'opacity .2s' }} />
        ))}
      </div>
    </div>
  )

  // ── Completed and Incomplete: one wide table, exactly the shape Tasks uses
  //    for the same two pages. Title and pills share a row, then the teal
  //    filter bar, then the gold-headed table, and View opens a centre modal ──
  if (completedOnly || incompleteOnly) {
    const cols = '40px 1fr 160px 150px 110px 120px 150px 75px'
    const hdrs = ['#', 'Client', 'Task', 'Team Lead', 'Year End', 'Phase',
                  incompleteOnly ? 'Status' : 'Signed Off', '']
    const sep  = { width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }
    const emptyLabel = incompleteOnly
      ? `No incomplete ${tabCfg.label} tasks.`
      : `No completed ${tabCfg.label} tasks yet.`

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f7f8fa' }}>

        {/* Header + audit pills on same row */}
        <div style={{ background: '#EDF0F3', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 8px', gap: 12, overflowX: 'auto', overflowY: 'hidden' }}>
            <h2 style={{ margin: 0, fontSize: 26, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', color: TEAL, flexShrink: 0, display: 'inline-block' }}>
              {incompleteOnly ? 'Incomplete Tasks' : 'Completed Tasks'}
            </h2>
            {deptSwitch}
            <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3, flexShrink: 0 }}>
              {AUDIT_TABS.map(tab => {
                const isActive = activeTab === tab.key
                return (
                  <button key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setSelected(null); try { sessionStorage.setItem(tabKey, tab.key) } catch {} }}
                    style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: isActive ? 700 : 500, transition: 'all .15s', border: 'none', background: isActive ? tab.color : 'transparent', color: isActive ? '#fff' : '#5C5C5C', whiteSpace: 'nowrap' }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3, flexShrink: 0 }}>
            {AUDIT_TABS.map(tab => (
              <div key={tab.key} style={{ flex: 1, background: tab.color, borderRadius: 2, opacity: activeTab === tab.key ? 1 : 0.35, transition: 'opacity .2s' }} />
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ background: '#EDF0F3', flexShrink: 0, padding: '10px 16px', borderBottom: `1px solid ${P.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px' }}>

            <PillSelect value={filterLead} onChange={setFilterLead} dimValue="all"
              options={[{ value: 'all', label: 'All Team Leads' }, ...leadOptions.map(l => ({ value: l.id, label: l.name }))]} />

            <div style={sep} />

            <PillSelect value={filterPhase} onChange={setFilterPhase} dimValue="all"
              options={[{ value: 'all', label: 'All Phases' }, ...PHASES.map(p => ({ value: p.value, label: p.label }))]} />

            {incompleteOnly && (
              <PillSelect value={filterStatus} onChange={setFilterStatus} dimValue="all"
                options={[{ value: 'all', label: 'All Status' }, { value: 'inprogress', label: 'In Progress' }, { value: 'sentback', label: 'Sent Back' }]} />
            )}

            <div style={sep} />

            {([['all', 'All'], ['this_month', 'This Month'], ['this_year', 'This Year'], ['custom', 'Custom']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilterTime(key)}
                style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: F, transition: 'all .15s', whiteSpace: 'nowrap',
                  background: filterTime === key ? NAVY : 'transparent',
                  color: filterTime === key ? '#fff' : 'rgba(255,255,255,0.85)' }}>
                {label}
              </button>
            ))}

            <div style={sep} />

            <div style={{ position: 'relative', width: 220, flexShrink: 0 }}>
              <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="completed-search"
                style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
            </div>

            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', paddingLeft: 4, paddingRight: 4 }}>
              {listed.length} tasks
            </span>
          </div>

          {filterTime === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingLeft: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>From:</span>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                style={{ padding: '4px 6px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: NAVY, fontSize: 12, outline: 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>To:</span>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                style={{ padding: '4px 6px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: NAVY, fontSize: 12, outline: 'none' }} />
              <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
                style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#fff', color: '#64748B', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 16px' }}>
          {loading && <div style={{ padding: 32, textAlign: 'center', color: P.textMuted, fontSize: 13 }}>Loading…</div>}

          {!loading && (
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, background: '#F2AC18', padding: '7px 18px', alignItems: 'center' }}>
                {hdrs.map((h, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: F }}>{h}</span>
                ))}
              </div>

              {listed.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: P.textMuted, fontSize: 13 }}>{emptyLabel}</div>
              )}

              {listed.map((r, idx) => {
                const clientName = r.client?.businessName ?? r.client?.user?.fullName ?? 'N/A'
                const signed     = r.signedOffAt ?? r.completedAt
                const signedStr  = signed
                  ? `${new Date(signed).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
                  : 'N/A'
                const sentBack   = r.status === 'SENT_BACK'
                const isSelected = selected === r.id
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, padding: '6px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', background: isSelected ? '#EBF4FF' : '#fff', transition: 'background .15s' }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{idx + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{clientName}</span>
                    <span style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{r.title}</span>
                    <span style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamLead?.fullName ?? 'Not assigned'}</span>
                    <span style={{ fontSize: 12, color: '#475569' }}>{r.periodLabel || fmtDate(r.periodEndDate)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tabCfg.color, background: tabCfg.bg, padding: '2px 8px', borderRadius: 5, width: 'fit-content' }}>
                      {PHASE_LABEL[r.phase] ?? r.phase}
                    </span>
                    {incompleteOnly
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: sentBack ? '#DC2626' : '#F97316', padding: '2px 8px', borderRadius: 5, width: 'fit-content' }}>
                          {sentBack ? 'Sent Back' : `${r.progress?.completed ?? 0}/${r.progress?.total ?? 0} done`}
                        </span>
                      : <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{signedStr}</span>
                    }
                    <button onClick={() => setSelected(r.id)}
                      style={{ padding: '5px 14px', borderRadius: 7, border: `1.5px solid ${TEAL}`, background: '#F0FAFB', color: TEAL, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}>
                      View
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* View modal, the same centre panel the tax lists open */}
        {current && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ width: 'min(960px,95vw)', height: '90vh', background: '#f7f8fa', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <button onClick={() => setSelected(null)}
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <EngagementDetail id={current.id} embedded onBack={() => setSelected(null)} onChanged={() => fetchRows(true)} />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f7f8fa', overflow: 'hidden' }}>

      {/* ── Second sidebar, same 340px rail as Tasks ── */}
      <div style={{ width: collapsed ? 0 : 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#EDF0F3', borderRight: `1px solid ${P.border}`, overflow: 'hidden', transition: 'width .25s' }}>
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${P.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: '0 14px' }}>
            <h2 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 18, color: TEAL, display: 'inline-block', whiteSpace: 'nowrap' }}>
              {tabCfg.label}
            </h2>
            <button onClick={() => setCollapsed(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6 }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </div>
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: '7px 10px' }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, fontFamily: F, background: 'transparent', color: NAVY }} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>Loading…</div>}
          {!loading && listed.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>
              {search ? 'Nothing matches that search.' : 'No engagements here yet.'}
            </div>
          )}
          {listed.map(r => {
            const active = selected === r.id
            const sm     = STATUS_META[r.status] ?? STATUS_META.IN_PROGRESS
            const name   = r.client?.businessName ?? r.client?.user?.fullName ?? ''
            return (
              <button key={r.id} onClick={() => setSelected(r.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', border: `1px solid ${active ? TEAL : P.border}`, borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: active ? '#E8EEF7' : '#F8FAFC', fontFamily: F }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#EEF2F7' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 5, background: '#F97316', color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', textTransform: 'uppercase' }}>
                    {(name || '?').trim().charAt(0) || '?'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#000', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  {/* Progress is the number that matters on an audit */}
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', flexShrink: 0 }}>
                    {r.progress?.completed ?? 0}/{r.progress?.total ?? 0}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: sm.color, background: sm.bg, flexShrink: 0 }}>{sm.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right pane ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {PillsRow}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px', minWidth: 0, position: 'relative' }}>
          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg,${TEAL} 0%,#0E5F6E 100%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {current ? (
            <EngagementDetail id={current.id} embedded onBack={() => setSelected(null)} onChanged={() => fetchRows(true)} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', color: P.textMuted, fontFamily: F, gap: 10 }}>
              <svg width={34} height={34} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span style={{ fontSize: 13 }}>Select an engagement to view details</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
