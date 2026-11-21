'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import PillSelect from '@/components/ui/PillSelect'
import DataTable from '@/components/ui/DataTable'
import EngagementDetail from './EngagementDetail'
import NewEngagementPanel from './NewEngagementPanel'
import { F, NAVY, TEAL, TASK_TYPES, STATUS_META, PHASE_LABEL, fmtDate } from './auditShared'

function StatCard({ label, value, border, fill }: { label: string; value: string | number; border: string; fill: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: fill, border: `1px solid ${border}30`, borderRadius: 10, padding: '11px 14px' }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827', fontFamily: F }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 300, fontFamily: "'Ethnocentric Rg', sans-serif", color: '#64748B' }}>{label}</p>
    </div>
  )
}

const STATUS_FILTERS = [
  { value: 'ALL',         label: 'All Status' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'SENT_BACK',   label: 'Sent Back' },
  { value: 'COMPLETED',   label: 'Completed' },
]

export default function AuditPage() {
  const { user } = useAuth()
  const isManager = ['ADMIN', 'PARTNER', 'MANAGER'].includes(String(user?.role))

  const [rows,     setRows]     = useState<any[]>([])
  const [summary,  setSummary]  = useState<any>({})
  const [loading,  setLoading]  = useState(true)
  const [taskType, setTaskType] = useState('ALL')
  const [status,   setStatus]   = useState('ALL')
  const [search,   setSearch]   = useState('')
  const [openId,   setOpenId]   = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const fetchRows = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    Promise.all([
      api.get('/audit/engagements', { params: {
        ...(taskType !== 'ALL' ? { taskType } : {}),
        ...(status   !== 'ALL' ? { status }   : {}),
      } }),
      api.get('/audit/summary'),
    ])
      .then(([list, sum]) => {
        setRows((list.data.data ?? list.data) || [])
        setSummary(sum.data.data ?? sum.data ?? {})
      })
      .catch(() => { if (!silent) setRows([]) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [taskType, status])

  useEffect(() => { fetchRows() }, [fetchRows])
  useAutoRefresh(() => fetchRows(true))

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.title?.toLowerCase().includes(q)
      || r.client?.businessName?.toLowerCase().includes(q)
      || r.client?.user?.fullName?.toLowerCase().includes(q))
  }, [rows, search])

  if (openId) {
    return <EngagementDetail id={openId} onBack={() => { setOpenId(null); fetchRows() }} onChanged={() => fetchRows(true)} />
  }

  if (creating) {
    return <NewEngagementPanel onClose={() => setCreating(false)} onSaved={id => { setCreating(false); fetchRows(); setOpenId(id) }} />
  }

  return (
    <div className="flex flex-col" style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>

      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, display: 'inline-block', color: TEAL }}>
          Audit
        </h1>
        <div style={{ flex: 1 }} />
        {isManager && (
          <button onClick={() => setCreating(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: TEAL, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F }}>
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Engagement
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Engagements"      value={summary.total ?? 0}               border="#1565C0" fill="#BDDAF8" />
        <StatCard label="In Progress"      value={summary.inProgress ?? 0}          border="#F2AC18" fill="#FBE3B8" />
        <StatCard label="Sent Back"        value={summary.sentBack ?? 0}            border="#DC2626" fill="#FECACA" />
        <StatCard label="Completed"        value={summary.completed ?? 0}           border="#16A34A" fill="#BBF0D6" />
        <StatCard label="My Working Papers" value={summary.myOpenWorkingPapers ?? 0} border="#7B2D8E" fill="#E4D4EC" />
      </div>

      {/* Filters */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.teal, borderRadius: 40, padding: '5px 8px', flexWrap: 'wrap' }}>
          <PillSelect value={taskType} onChange={setTaskType} dimValue="ALL" minWidth={190}
            options={[{ value: 'ALL', label: 'All Types' }, ...TASK_TYPES]} />
          <PillSelect value={status} onChange={setStatus} dimValue="ALL" minWidth={150}
            options={STATUS_FILTERS} />

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.3)', flexShrink: 0, margin: '0 2px' }} />

          <div style={{ position: 'relative', flex: 1, minWidth: 150, maxWidth: 240 }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search client / title…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 30, border: '1.5px solid rgba(255,255,255,0.35)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F }} />
          </div>

          <span style={{ flex: 1 }} />
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', padding: '0 4px' }}>{visible.length} engagements</span>
        </div>
      </div>

      <DataTable
        id="auditEngagements" minWidth={1040} rows={visible} loading={loading}
        rowKey={(r: any) => r.id} onRowClick={(r: any) => setOpenId(r.id)}
        emptyText={search ? `No engagements matching "${search}".` : 'No audit engagements yet. A manager raises one with New Engagement.'}
        columns={[
          { key: 'client', label: 'Client', width: 190, cellStyle: { fontWeight: 700, color: NAVY },
            render: (r: any) => r.client?.businessName ?? r.client?.user?.fullName ?? '' },
          { key: 'title', label: 'Engagement', width: 210 },
          { key: 'taskType', label: 'Type', width: 140,
            render: (r: any) => TASK_TYPES.find(t => t.value === r.taskType)?.label ?? r.taskType },
          { key: 'periodEndDate', label: 'Period End', width: 110, cellStyle: { color: '#64748B' },
            render: (r: any) => r.periodLabel || fmtDate(r.periodEndDate) },
          { key: 'teamLead', label: 'Team Lead', width: 140, cellStyle: { color: '#475569' },
            render: (r: any) => r.teamLead?.fullName ?? 'Not assigned' },
          { key: 'team', label: 'Team', width: 66, align: 'right', cellStyle: { color: '#64748B' },
            render: (r: any) => r.team?.length ?? 0 },
          { key: 'phase', label: 'Phase', width: 118, cellStyle: { color: '#475569' },
            render: (r: any) => PHASE_LABEL[r.phase] ?? r.phase },
          // Progress is the headline number on an audit: how many areas are signed off
          { key: 'progress', label: 'Progress', width: 132, render: (r: any) => {
            const pct = r.progress?.percent ?? 0
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16A34A' : TEAL }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>{r.progress?.completed ?? 0}/{r.progress?.total ?? 0}</span>
              </div>
            )
          } },
          // Open review points are what actually blocks a sign off
          { key: 'openReviewPoints', label: 'Open Points', width: 96, align: 'right', render: (r: any) =>
            r.openReviewPoints > 0
              ? <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 800, color: '#991B1B', background: '#FEE2E2' }}>{r.openReviewPoints}</span>
              : <span style={{ color: '#94A3B8' }}>0</span> },
          { key: 'status', label: 'Status', width: 112, render: (r: any) => {
            const m = STATUS_META[r.status] ?? STATUS_META.IN_PROGRESS
            return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: m.color, background: m.bg }}>{m.label}</span>
          } },
        ]}
      />
    </div>
  )
}
