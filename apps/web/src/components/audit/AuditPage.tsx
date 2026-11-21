'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import EngagementDetail from './EngagementDetail'
import NewEngagementPanel from './NewEngagementPanel'
import { F, NAVY, TEAL, STATUS_META, PHASE_LABEL, fmtDate } from './auditShared'

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

export default function AuditPage({ approvalOnly = false, completedOnly = false }: {
  approvalOnly?: boolean; completedOnly?: boolean
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

  // Remember the tab between visits, the way Tasks does
  useEffect(() => {
    try { const t = sessionStorage.getItem(TAB_KEY); if (t) setActiveTab(t) } catch { /* private mode */ }
  }, [])

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

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of forView) c[r.taskType] = (c[r.taskType] ?? 0) + 1
    return c
  }, [forView])

  const listed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return forView
      .filter(r => r.taskType === activeTab)
      .filter(r => !q
        || r.title?.toLowerCase().includes(q)
        || r.client?.businessName?.toLowerCase().includes(q)
        || r.client?.user?.fullName?.toLowerCase().includes(q))
  }, [forView, activeTab, search])

  const current = listed.find(r => r.id === selected) ?? null
  const tabCfg  = AUDIT_TABS.find(t => t.key === activeTab)!

  if (creating) {
    return <NewEngagementPanel onClose={() => setCreating(false)} onSaved={id => { setCreating(false); fetchRows(); setSelected(id) }} />
  }

  // ── Pills row, lifted from Tasks so the two look identical ────────────────
  const PillsRow = (
    <div style={{ flexShrink: 0, overflow: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 24px 8px', background: '#f7f8fa', overflow: 'visible' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3, overflow: 'visible' }}>
          {AUDIT_TABS.map(tab => {
            const active = activeTab === tab.key
            const cnt    = tabCounts[tab.key] ?? 0
            return (
              <button key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelected(null); try { sessionStorage.setItem(TAB_KEY, tab.key) } catch {} }}
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
      </div>
      <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3, flexShrink: 0 }}>
        {AUDIT_TABS.map(tab => (
          <div key={tab.key} style={{ flex: 1, background: tab.color, borderRadius: 2, opacity: activeTab === tab.key ? 1 : 0.35, transition: 'opacity .2s' }} />
        ))}
      </div>
    </div>
  )

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 52, flexShrink: 0 }}>
          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4 }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, color: TEAL }}>
            {approvalOnly ? 'Task Approval' : completedOnly ? 'Completed Tasks' : 'Tasks'}
          </h1>
          <div style={{ flex: 1 }} />
          {isManager && !approvalOnly && !completedOnly && (
            <button onClick={() => setCreating(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: TEAL, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Task
            </button>
          )}
        </div>

        {PillsRow}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px', minWidth: 0 }}>
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
