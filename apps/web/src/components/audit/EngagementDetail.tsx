'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import StyledSelect from '@/components/ui/StyledSelect'
import { uploadFile } from '@/lib/storage'
import WorkingPaperPanel from './WorkingPaperPanel'
import {
  F, NAVY, TEAL, PHASES, PHASE_LABEL, STATUS_META, WP_STATUS_META, AREA_GROUP_LABEL,
  TASK_TYPES, PanelHeader, inputStyle, labelStyle, btn, fmtDate, money,
} from './auditShared'

// embedded means it is already inside the Tasks right pane, so it drops its
// own page chrome and renders just the engagement.
export default function EngagementDetail({ id, onBack, onChanged, embedded }: {
  id: string; onBack: () => void; onChanged?: () => void; embedded?: boolean
}) {
  const { user } = useAuth()
  const isManager = ['ADMIN', 'PARTNER', 'MANAGER'].includes(String(user?.role))

  const [eng,     setEng]     = useState<any>(null)
  const [areas,   setAreas]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openWp,  setOpenWp]  = useState<string | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')

  // Allocate a head to a member
  const [addArea,   setAddArea]   = useState('')
  const [addMember, setAddMember] = useState('')

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get(`/audit/engagements/${id}`)
      .then(({ data }) => setEng(data.data ?? data))
      .catch(() => setEng(null))
      .finally(() => { if (!silent) setLoading(false) })
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/audit/areas').then(({ data }) => setAreas(data.data ?? data ?? [])).catch(() => setAreas([])) }, [])
  useAutoRefresh(() => load(true))

  const refresh = () => { load(true); onChanged?.() }

  const isTeamLead = eng?.teamLeadId === user?.id
  const mayAllocate = isManager || isTeamLead

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError('')
    try { await fn(); refresh() }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Action failed') }
    finally { setBusy(false) }
  }

  // A manager can remove any job, anyone else only the one they raised, and
  // never one that has been signed off
  const canDelete = !!eng && !eng.signedOffAt && eng.status !== 'COMPLETED'
    && (isManager || eng.createdBy?.id === user?.id)

  async function remove() {
    if (!window.confirm('Delete this task? Its working papers, review points and attachments go with it. This cannot be undone.')) return
    setBusy(true); setError('')
    try { await api.delete(`/audit/engagements/${id}`); onChanged?.(); onBack() }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Could not delete this task'); setBusy(false) }
  }

  async function addWorkingPaper() {
    if (!addArea) { setError('Pick an area'); return }
    await act(async () => {
      await api.post(`/audit/engagements/${id}/working-papers`, {
        areaId: addArea, assignedToId: addMember || undefined,
      })
      setAddArea(''); setAddMember('')
    })
  }

  // The two files that release the completion gate go straight to B2 like
  // every other file in the CRM; only the reference is stored here.
  async function uploadReport(kind: 'FINANCIAL_STATEMENTS' | 'AUDIT_REPORT', file: File) {
    await act(async () => {
      const up = await uploadFile(file, 'audit')
      await api.post('/audit/attachments', {
        engagementId: id, kind, fileName: file.name,
        fileKey: up.url, fileSize: file.size, mimeType: file.type,
      })
    })
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: P.textMuted, fontFamily: F }}>Loading…</div>
  if (!eng)    return <div style={{ padding: 48, textAlign: 'center', color: P.textMuted, fontFamily: F }}>Engagement not found.</div>

  if (openWp) {
    return <WorkingPaperPanel id={openWp} engagement={eng} onBack={() => { setOpenWp(null); refresh() }} onChanged={refresh} />
  }

  const clientName = eng.client?.businessName ?? eng.client?.user?.fullName ?? ''
  const sm = STATUS_META[eng.status] ?? STATUS_META.IN_PROGRESS

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', fontFamily: F }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: F, marginTop: 2 }}>{value || '-'}</div>
    </div>
  )

  return (
    <div style={embedded ? {} : { background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>
      {!embedded && (
        <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, color: TEAL }}>Tasks</h1>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F, marginBottom: 16 }}>
        <PanelHeader
          title={eng.title}
          pill={clientName}
          onBack={onBack}
          right={
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14 }}>{eng.progress?.completed ?? 0}/{eng.progress?.total ?? 0}</span>
                <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: 12 }}>Areas Done</span>
              </span>
              {/* A job raised by mistake has to be removable. Signed off ones
                  are history and the server refuses them. */}
              {canDelete && (
                <button onClick={remove} disabled={busy} style={{
                  cursor: 'pointer', color: '#FEE2E2', fontWeight: 700, fontFamily: F,
                  background: 'rgba(220,38,38,0.35)', border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 8, padding: '4px 12px', fontSize: 12, whiteSpace: 'nowrap',
                }}>
                  Delete
                </button>
              )}
            </span>
          }
        />

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 18 }}>
            {field('Type', TASK_TYPES.find(t => t.value === eng.taskType)?.label ?? eng.taskType)}
            {field('Period End', eng.periodLabel || fmtDate(eng.periodEndDate))}
            {field('Due', fmtDate(eng.dueDate))}
            {field('Team Lead', eng.teamLead?.fullName ?? 'Not assigned')}
            {field('Materiality', money(eng.materiality))}
            {field('Status', <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: sm.color, background: sm.bg }}>{sm.label}</span>)}
          </div>

          {/* Phase. The team lead or a manager moves the file along. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Phase</span>
            {mayAllocate ? (
              <div style={{ minWidth: 180 }}>
                <StyledSelect value={eng.phase} options={PHASES}
                  onChange={v => act(() => api.patch(`/audit/engagements/${id}`, { phase: v }))} />
              </div>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{PHASE_LABEL[eng.phase] ?? eng.phase}</span>
            )}
          </div>

          {eng.status === 'SENT_BACK' && eng.sentBackReason && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#991B1B', letterSpacing: '0.08em' }}>SENT BACK</span>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#991B1B' }}>{eng.sentBackReason}</p>
            </div>
          )}

          {/* The completion gate, stated plainly rather than hidden behind a disabled button */}
          <div style={{
            background: eng.canComplete ? '#F0FDF4' : '#F8FAFC',
            border: `1px solid ${eng.canComplete ? '#BBF7D0' : P.border}`,
            borderRadius: 8, padding: '12px 14px', marginBottom: 18,
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', color: eng.canComplete ? '#166534' : '#64748B', marginBottom: 6 }}>
              {eng.canComplete ? 'READY TO SIGN OFF' : 'BEFORE THIS CAN BE SIGNED OFF'}
            </div>
            {eng.canComplete ? (
              <p style={{ margin: 0, fontSize: 12, color: '#166534' }}>Every area is complete, no review points are open, and both reports are attached.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#64748B', lineHeight: 1.7 }}>
                {(eng.blockers ?? []).map((b: string) => <li key={b}>{b}</li>)}
              </ul>
            )}
          </div>

          {/* The two mandatory reports */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            {([
              { kind: 'FINANCIAL_STATEMENTS' as const, label: 'Signed Financial Statements', has: !!eng.financialStatementsFileId },
              { kind: 'AUDIT_REPORT' as const,         label: 'Audit Report',                 has: !!eng.auditReportFileId },
            ])
              // Only the files this task type actually has to produce. A general
              // task has no audit report, so asking for one would be noise.
              .filter(r => (eng.requiredFiles ?? []).includes(r.kind))
              .map(r => (
              <div key={r.kind}>
                <label style={labelStyle}>{r.label} <span style={{ color: '#ef4444' }}>*</span></label>
                {r.has ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4' }}>
                    <span style={{ flex: 1, fontSize: 12, color: '#166534', fontWeight: 700 }}>
                      {(eng.attachments ?? []).find((a: any) => a.kind === r.kind)?.fileName ?? 'Attached'}
                    </span>
                    {mayAllocate && (
                      <button onClick={() => act(() => api.delete(`/audit/attachments/${(eng.attachments ?? []).find((a: any) => a.kind === r.kind)?.id}`))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 15, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 8, border: `1px dashed ${P.border}`, cursor: 'pointer', fontSize: 12, color: '#94A3B8', background: '#FAFAFA' }}>
                    {busy ? 'Uploading…' : 'Attach file'}
                    <input type="file" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadReport(r.kind, f); e.target.value = '' }} />
                  </label>
                )}
              </div>
            ))}
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 12px' }}>{error}</p>}

          {isManager && eng.status !== 'COMPLETED' && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button disabled={busy}
                onClick={() => { const r = window.prompt('Why is this going back to the team?'); if (r) act(() => api.post(`/audit/engagements/${id}/send-back`, { reason: r })) }}
                style={{ ...btn('#fff', '#991B1B'), border: '1px solid #FECACA' }}>
                Send Back
              </button>
              <button disabled={busy || !eng.canComplete} title={eng.canComplete ? 'Sign off this engagement' : 'Clear the blockers above first'}
                onClick={() => act(() => api.post(`/audit/engagements/${id}/sign-off`, {}))}
                style={{ ...btn('#16a34a'), opacity: (busy || !eng.canComplete) ? 0.45 : 1, cursor: eng.canComplete ? 'pointer' : 'not-allowed' }}>
                Sign Off
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Working papers */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', fontFamily: F }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: NAVY, letterSpacing: '0.04em' }}>Working Papers</span>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>{eng.workingPapers?.length ?? 0} areas</span>
          <div style={{ flex: 1 }} />

          {mayAllocate && eng.status !== 'COMPLETED' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 210 }}>
                <StyledSelect value={addArea} onChange={setAddArea} placeholder="Add area…"
                  options={areas.map((a: any) => ({ value: a.id, label: `${AREA_GROUP_LABEL[a.group] ?? a.group} · ${a.name}` }))} />
              </div>
              <div style={{ minWidth: 170 }}>
                <StyledSelect value={addMember} onChange={setAddMember} placeholder="Assign to…"
                  options={(eng.team ?? []).map((t: any) => ({ value: t.user.id, label: t.user.fullName }))} />
              </div>
              <button onClick={addWorkingPaper} disabled={busy} style={{ ...btn(TEAL), padding: '7px 14px' }}>Add</button>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '26%' }} /><col style={{ width: '18%' }} /><col style={{ width: 130 }} />
              <col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 96 }} /><col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                {['Area', 'Assigned To', 'Status', 'Current Year', 'Prior Year', 'Open Points', 'Steps'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(eng.workingPapers ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: P.textMuted, fontSize: 13 }}>
                  No areas allocated yet. The team lead adds them above.
                </td></tr>
              ) : eng.workingPapers.map((w: any, i: number) => {
                const m = WP_STATUS_META[w.status] ?? WP_STATUS_META.NOT_STARTED
                const open = (w.reviewPoints ?? []).filter((p: any) => p.status !== 'CLEARED').length
                const doneSteps = (w.steps ?? []).filter((s: any) => s.isDone).length
                const td: React.CSSProperties = { padding: '6px 12px', fontSize: 12, borderBottom: `1px solid ${P.border}50`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                return (
                  <tr key={w.id} onClick={() => setOpenWp(w.id)}
                    style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC', cursor: 'pointer' }}>
                    <td style={{ ...td, fontWeight: 700, color: NAVY }}>{w.areaName}</td>
                    <td style={{ ...td, color: '#475569' }}>{w.assignedTo?.fullName ?? 'Unassigned'}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700, color: m.color, background: m.bg }}>{m.label}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{money(w.currentYearAmount)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#64748B' }}>{money(w.priorYearAmount)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {open > 0
                        ? <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 800, color: '#991B1B', background: '#FEE2E2' }}>{open}</span>
                        : <span style={{ color: '#94A3B8' }}>0</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#64748B' }}>{doneSteps}/{(w.steps ?? []).length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
