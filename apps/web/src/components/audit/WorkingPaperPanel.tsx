'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import { uploadFile } from '@/lib/storage'
import { fileHref } from '@/lib/storage'
import {
  F, NAVY, TEAL, WP_STATUS_META, PanelHeader, inputStyle, labelStyle, btn, fmtDate, money,
} from './auditShared'

// One area of the file: the procedures, the numbers, the review conversation and
// the evidence, in the order someone actually works through them.
export default function WorkingPaperPanel({ id, engagement, onBack, onChanged }: {
  id: string; engagement: any; onBack: () => void; onChanged?: () => void
}) {
  const { user } = useAuth()
  const isManager = ['ADMIN', 'PARTNER', 'MANAGER'].includes(String(user?.role))

  const [wp,    setWp]    = useState<any>(null)
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')
  const [newPoint, setNewPoint] = useState('')
  const [reply,    setReply]    = useState<Record<string, string>>({})

  // The working paper comes back inside the engagement, so re-reading that is
  // cheaper than another endpoint and keeps the two in step.
  const load = useCallback((silent = false) => {
    api.get(`/audit/engagements/${engagement.id}`)
      .then(({ data }) => {
        const eng = data.data ?? data
        setWp((eng.workingPapers ?? []).find((w: any) => w.id === id) ?? null)
      })
      .catch(() => { if (!silent) setWp(null) })
  }, [engagement.id, id])

  useEffect(() => { load() }, [load])

  const refresh = () => { load(true); onChanged?.() }

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError('')
    try { await fn(); refresh() }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Action failed') }
    finally { setBusy(false) }
  }

  if (!wp) return <div style={{ padding: 48, textAlign: 'center', color: P.textMuted, fontFamily: F }}>Loading…</div>

  const isOwner    = wp.assignedToId === user?.id
  const isTeamLead = engagement.teamLeadId === user?.id
  const isReviewer = isManager || isTeamLead
  const m          = WP_STATUS_META[wp.status] ?? WP_STATUS_META.NOT_STARTED

  const openPoints = (wp.reviewPoints ?? []).filter((p: any) => p.status !== 'CLEARED')
  const steps      = wp.steps ?? []
  const doneSteps  = steps.filter((s: any) => s.isDone).length
  const canSubmit  = isOwner && steps.length > 0 && doneSteps === steps.length
    && ['NOT_STARTED', 'IN_PROGRESS', 'AWAITING_DATA', 'SENT_BACK'].includes(wp.status)

  const awaitingTeamLead = wp.status === 'TEAM_LEAD_REVIEW'
  const awaitingManager  = wp.status === 'MANAGER_REVIEW'
  const canReview = (awaitingTeamLead && isReviewer) || (awaitingManager && isManager)

  return (
    <div style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, color: TEAL }}>Audit</h1>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
        <PanelHeader
          title={wp.areaName}
          pill={wp.assignedTo?.fullName ?? 'Unassigned'}
          onBack={onBack}
          right={
            <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, color: m.color, background: m.bg }}>
              {m.label}
            </span>
          }
        />

        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>

          {/* Left: the procedures and the numbers */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', marginBottom: 8 }}>
              PROCEDURES ({doneSteps}/{steps.length})
            </div>
            {steps.map((s: any) => (
              <label key={s.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 0',
                borderBottom: `1px solid ${P.gridLine}`, cursor: isOwner ? 'pointer' : 'default',
              }}>
                <input type="checkbox" checked={s.isDone} disabled={!isOwner || busy}
                  onChange={e => act(() => api.patch(`/audit/steps/${s.id}`, { isDone: e.target.checked }))}
                  style={{ accentColor: TEAL, marginTop: 2, cursor: isOwner ? 'pointer' : 'default' }} />
                <span style={{ flex: 1, fontSize: 13, color: s.isDone ? '#94A3B8' : NAVY, textDecoration: s.isDone ? 'line-through' : 'none' }}>
                  {s.name}
                  {s.isDone && s.completedBy && (
                    <span style={{ display: 'block', fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>
                      {s.completedBy.fullName} · {fmtDate(s.completedAt)}
                    </span>
                  )}
                </span>
              </label>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              <div>
                <label style={labelStyle}>Current Year</label>
                <input type="number" defaultValue={wp.currentYearAmount ?? ''} disabled={!isOwner && !isReviewer}
                  onBlur={e => act(() => api.patch(`/audit/working-papers/${id}`, { currentYearAmount: Number(e.target.value) || 0 }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Prior Year</label>
                <input type="number" defaultValue={wp.priorYearAmount ?? ''} disabled={!isOwner && !isReviewer}
                  onBlur={e => act(() => api.patch(`/audit/working-papers/${id}`, { priorYearAmount: Number(e.target.value) || 0 }))}
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Conclusion</label>
              <textarea defaultValue={wp.conclusion ?? ''} rows={3} disabled={!isOwner}
                placeholder="What the testing showed and whether the balance is fairly stated"
                onBlur={e => act(() => api.patch(`/audit/working-papers/${id}`, { conclusion: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {/* Evidence */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', margin: '18px 0 8px' }}>
              EVIDENCE
            </div>
            {(wp.attachments ?? []).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${P.gridLine}` }}>
                <a href={fileHref(a.fileKey, { name: a.fileName })} target="_blank" rel="noreferrer"
                  style={{ flex: 1, fontSize: 12, color: TEAL, fontWeight: 700, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.fileName}
                </a>
                <span style={{ fontSize: 10.5, color: '#94A3B8' }}>{a.uploadedBy?.fullName}</span>
                {(isOwner || isReviewer) && (
                  <button onClick={() => act(() => api.delete(`/audit/attachments/${a.id}`))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 15, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
            {(isOwner || isReviewer) && (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, padding: 8, borderRadius: 8, border: `1px dashed ${P.border}`, cursor: 'pointer', fontSize: 12, color: '#94A3B8', background: '#FAFAFA' }}>
                {busy ? 'Uploading…' : 'Attach supporting document'}
                <input type="file" style={{ display: 'none' }} onChange={e => {
                  const f = e.target.files?.[0]; e.target.value = ''
                  if (f) act(async () => {
                    const up = await uploadFile(f, 'audit')
                    await api.post('/audit/attachments', {
                      workingPaperId: id, fileName: f.name,
                      fileKey: up.url, fileSize: f.size, mimeType: f.type,
                    })
                  })
                }} />
              </label>
            )}
          </div>

          {/* Right: the review conversation */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', marginBottom: 8 }}>
              REVIEW POINTS {openPoints.length > 0 && (
                <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 9999, fontSize: 10, color: '#991B1B', background: '#FEE2E2' }}>
                  {openPoints.length} open
                </span>
              )}
            </div>

            {(wp.reviewPoints ?? []).length === 0 && (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94A3B8' }}>
                No review points raised. A reviewer adds one below when something needs following up.
              </p>
            )}

            {(wp.reviewPoints ?? []).map((pt: any) => {
              const cleared = pt.status === 'CLEARED'
              return (
                <div key={pt.id} style={{
                  border: `1px solid ${cleared ? '#BBF7D0' : '#FECACA'}`,
                  background: cleared ? '#F0FDF4' : '#FEF2F2',
                  borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', color: cleared ? '#166534' : '#991B1B' }}>
                      {cleared ? 'CLEARED' : pt.status === 'ANSWERED' ? 'ANSWERED' : 'OPEN'}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#94A3B8' }}>{pt.raisedBy?.fullName} · {fmtDate(pt.createdAt)}</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: 13, color: NAVY }}>{pt.note}</p>

                  {pt.response && (
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#475569', paddingLeft: 10, borderLeft: `2px solid ${P.border}` }}>
                      {pt.response}
                      <span style={{ display: 'block', fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>
                        {pt.respondedBy?.fullName}
                      </span>
                    </p>
                  )}

                  {!cleared && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {isOwner && (
                        <>
                          <input value={reply[pt.id] ?? ''} onChange={e => setReply(r => ({ ...r, [pt.id]: e.target.value }))}
                            placeholder="Your response" style={{ ...inputStyle, flex: 1, minWidth: 140, padding: '6px 10px', fontSize: 12 }} />
                          <button disabled={busy} onClick={() => act(() => api.patch(`/audit/review-points/${pt.id}`, { action: 'RESPOND', response: reply[pt.id] }))}
                            style={{ ...btn(TEAL), padding: '6px 12px', fontSize: 12 }}>Reply</button>
                        </>
                      )}
                      {isReviewer && (
                        <button disabled={busy} onClick={() => act(() => api.patch(`/audit/review-points/${pt.id}`, { action: 'CLEAR' }))}
                          style={{ ...btn('#16a34a'), padding: '6px 12px', fontSize: 12 }}>Clear</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {isReviewer && wp.status !== 'COMPLETED' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input value={newPoint} onChange={e => setNewPoint(e.target.value)} placeholder="Raise a review point"
                  style={{ ...inputStyle, flex: 1 }} />
                <button disabled={busy || !newPoint.trim()}
                  onClick={() => act(async () => { await api.post(`/audit/working-papers/${id}/review-points`, { note: newPoint }); setNewPoint('') })}
                  style={{ ...btn(NAVY), opacity: newPoint.trim() ? 1 : 0.5 }}>Add</button>
              </div>
            )}

            {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

            {/* Hand up or sign off */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
              {isOwner && !canSubmit && wp.status !== 'COMPLETED' && steps.length > doneSteps && (
                <span style={{ fontSize: 11.5, color: '#94A3B8', alignSelf: 'center' }}>
                  {steps.length - doneSteps} procedure(s) left before this can go for review
                </span>
              )}
              {canSubmit && (
                <button disabled={busy} onClick={() => act(() => api.post(`/audit/working-papers/${id}/submit`, {}))}
                  style={{ ...btn(TEAL) }}>Submit for Review</button>
              )}
              {canReview && (
                <>
                  <button disabled={busy}
                    onClick={() => { const r = window.prompt('Why is this going back?'); if (r) act(() => api.post(`/audit/working-papers/${id}/review`, { action: 'SEND_BACK', reason: r })) }}
                    style={{ ...btn('#fff', '#991B1B'), border: '1px solid #FECACA' }}>Send Back</button>
                  <button disabled={busy || openPoints.length > 0}
                    title={openPoints.length > 0 ? 'Clear the open review points first' : undefined}
                    onClick={() => act(() => api.post(`/audit/working-papers/${id}/review`, { action: 'APPROVE' }))}
                    style={{ ...btn('#16a34a'), opacity: openPoints.length > 0 ? 0.45 : 1, cursor: openPoints.length > 0 ? 'not-allowed' : 'pointer' }}>
                    {awaitingManager ? 'Approve & Complete' : 'Approve to Manager'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
