'use client'
import React, { useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const NAVY   = '#132E57'
const TEAL   = '#1E8496'
const GREEN  = '#16a34a'
const WARN   = '#D97706'
const DANGER = '#DC2626'
const PURPLE = '#7C3AED'
const F      = "'Inter','DM Sans',-apple-system,sans-serif"

// Review/approval steps are Manager+ or Partner+ tier decisions — mirrors the backend's enforcement in fbr.service.ts
const MANAGER_TIER = ['ADMIN', 'PARTNER', 'MANAGER', 'TEAM_LEAD']
const PARTNER_TIER = ['ADMIN', 'PARTNER']

function WaitingFor({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 4, flexShrink: 0, fontFamily: F }}>
      With {label}
    </span>
  )
}

function fmt(d?: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Role tag ──────────────────────────────────────────────────────────────────
function RoleTag({ role }: { role: 'Trainee' | 'Manager' | 'Partner' }) {
  const isP = role === 'Partner', isM = role === 'Manager'
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, flexShrink: 0, fontFamily: F,
      color:      isP ? '#78350F' : isM ? NAVY   : '#166534',
      background: isP ? '#FEF3C7' : isM ? '#EFF6FF' : '#F0FDF4',
    }}>{role}</span>
  )
}

// ── Actor tag (who actually did it, once known) ─────────────────────────────────
function ActorTag({ name }: { name: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, flexShrink: 0, fontFamily: F, color: '#166534', background: '#F0FDF4' }}>
      {name}
    </span>
  )
}

// ── Arrow connector ───────────────────────────────────────────────────────────
function StepArrow({ done }: { done: boolean }) {
  const col = done ? '#BBF7D0' : '#E2E8F0'
  return (
    <div style={{ display: 'flex' }}>
      <div style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 1.5, height: 10, background: col }} />
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none">
          <path d="M4.5 6L0 0H9L4.5 6Z" fill={col} />
        </svg>
        <div style={{ width: 1.5, height: 10, background: col }} />
      </div>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ done, total, color = TEAL }: { done: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: pct === 100 ? GREEN : color, transition: 'width .4s' }} />
        </div>
        <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, fontWeight: 500, fontFamily: F, whiteSpace: 'nowrap' as const }}>{done} / {total} steps</span>
      </div>
    </div>
  )
}

// ── Step card ─────────────────────────────────────────────────────────────────
type StepCardProps = {
  idx: number; label: string; role: 'Trainee' | 'Manager' | 'Partner'
  isDone: boolean; isActive: boolean
  doneDate?: string | null; undoable?: boolean
  onUndo?: () => void; actionLoading?: boolean
  actorName?: string | null
  children?: React.ReactNode
  noteSection?: React.ReactNode
}
function StepCard({ idx, label, role, isDone, isActive, doneDate, undoable, onUndo, actionLoading, actorName, children, noteSection }: StepCardProps) {
  const isFuture = !isDone && !isActive
  const dotBg   = isDone ? GREEN : isActive ? TEAL : '#E2E8F0'
  const cardBg  = isDone ? '#F0FDF4' : isActive ? '#fff' : '#FAFAFA'
  const cardBdr = isDone ? '#BBF7D0' : isActive ? '#BAE6FD' : '#E2E8F0'

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <div style={{ flexShrink: 0, width: 28, paddingTop: 14, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: dotBg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: isDone || isActive ? 'none' : '1.5px solid #CBD5E1' }}>
          {isDone
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            : <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#fff' : '#94A3B8', lineHeight: 1 }}>{idx + 1}</span>
          }
        </div>
      </div>
      <div style={{ flex: 1, marginLeft: 10, paddingTop: 8 }}>
        <div style={{ background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 600 : isDone ? 400 : 500, color: isFuture ? '#94A3B8' : isDone ? '#64748B' : NAVY, lineHeight: 1.4, fontFamily: F }}>{label}</span>
            {isDone && actorName ? <ActorTag name={actorName} /> : <RoleTag role={role} />}
            {isDone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: GREEN, fontFamily: F }}>Done</span>
                {doneDate && <span style={{ fontSize: 10, color: '#64748B', background: '#F1F5F9', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' as const, fontFamily: F }}>{fmt(doneDate)}</span>}
                {undoable && (
                  <button onClick={onUndo} disabled={actionLoading} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', fontFamily: F, opacity: actionLoading ? 0.5 : 1 }}>
                    Undo
                  </button>
                )}
              </div>
            )}
            {isActive && children}
            {isActive && !children && <span style={{ fontSize: 11, fontWeight: 600, color: TEAL, background: '#E0F2FE', padding: '2px 8px', borderRadius: 4, fontFamily: F }}>In Progress</span>}
            {isFuture  && <span style={{ fontSize: 10, color: '#CBD5E1', background: '#F8FAFC', padding: '2px 8px', borderRadius: 4, fontFamily: F }}>Pending</span>}
          </div>
          {isActive && noteSection && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>
              {noteSection}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Comment + Attachment block ─────────────────────────────────────────────────
type NoteAreaProps = {
  comment: string; onComment: (v: string) => void
  attachUrl: string; attachName: string
  onClearAttach: () => void
  attachUploading: boolean; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}
function NoteArea({ comment, onComment, attachUrl, attachName, onClearAttach, attachUploading, onUpload }: NoteAreaProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 8 }}>
      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: F }}>Comment</label>
        <textarea value={comment} onChange={e => onComment(e.target.value)} placeholder="Optional note..." rows={2}
          style={{ width: '100%', boxSizing: 'border-box' as const, padding: '6px 9px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12, outline: 'none', resize: 'none' as const, color: NAVY, fontFamily: F, height: 60 }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: F }}>Attachment</label>
        {attachUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderRadius: 6, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 11, height: 60, boxSizing: 'border-box' as const }}>
            <span style={{ flex: 1, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontSize: 10 }}>{attachName}</span>
            <button onClick={onClearAttach} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 6, border: '1px dashed #CBD5E1', cursor: attachUploading ? 'default' : 'pointer', fontSize: 11, color: '#94A3B8', background: '#FAFAFA', height: 60, boxSizing: 'border-box' as const }}>
            {attachUploading ? 'Uploading…' : (
              <>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Upload
              </>
            )}
            <input type="file" style={{ display: 'none' }} disabled={attachUploading} onChange={onUpload} />
          </label>
        )}
      </div>
    </div>
  )
}

// ── Attachments display (on done records) ─────────────────────────────────────
function AttachList({ notes, attachments }: { notes?: string | null; attachments?: any[] }) {
  if (!notes && !(attachments?.length)) return null
  return (
    <div style={{ borderTop: '1px solid #F1F5F9', padding: '8px 12px', background: '#FAFAFA' }}>
      {notes && (
        <div style={{ fontSize: 11, color: '#475569', marginBottom: attachments?.length ? 5 : 0, fontFamily: F }}>
          <span style={{ fontWeight: 600, color: '#94A3B8' }}>Note: </span>{notes}
        </div>
      )}
      {attachments?.map((att: any) => (
        <a key={att.id} href={`http://localhost:4000${att.url}`} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: TEAL, textDecoration: 'none', marginRight: 10, fontFamily: F }}>
          <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          {att.label || att.url.split('/').pop()}
        </a>
      ))}
    </div>
  )
}

// ── Outcome decision step ─────────────────────────────────────────────────────
function OutcomeStep({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <div style={{ flexShrink: 0, width: 28, paddingTop: 14, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${WARN}` }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: WARN }}>?</span>
        </div>
      </div>
      <div style={{ flex: 1, marginLeft: 10, paddingTop: 8 }}>
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#78350F', fontFamily: F, marginBottom: 10 }}>{question}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── Result card ───────────────────────────────────────────────────────────────
function ResultCard({ label, color, onUndo, loading, actorName, children }: { label: string; color: string; onUndo: () => void; loading: boolean; actorName?: string | null; children?: React.ReactNode }) {
  const BG: Record<string, string> = { [GREEN]: '#F0FDF4', [DANGER]: '#FEF2F2', '#1E40AF': '#EFF6FF', [PURPLE]: '#FAF5FF' }
  const BD: Record<string, string> = { [GREEN]: '#BBF7D0', [DANGER]: '#FECACA', '#1E40AF': '#BFDBFE', [PURPLE]: '#DDD6FE' }
  const TX: Record<string, string> = { [GREEN]: '#14532D', [DANGER]: '#7F1D1D', '#1E40AF': '#1E3A8A', [PURPLE]: '#4C1D95' }
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <div style={{ flexShrink: 0, width: 28, paddingTop: 14, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
      </div>
      <div style={{ flex: 1, marginLeft: 10, paddingTop: 8 }}>
        <div style={{ background: BG[color] ?? '#F9FAFB', border: `1px solid ${BD[color] ?? '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: TX[color] ?? NAVY, fontFamily: F }}>{label}</span>
            {actorName && <ActorTag name={actorName} />}
            <button onClick={onUndo} disabled={loading} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', fontFamily: F, opacity: loading ? 0.5 : 1 }}>Undo</button>
          </div>
          {children && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BD[color] ?? '#E2E8F0'}` }}>{children}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────
function Btn({ label, color = TEAL, onClick, disabled = false }: { label: string; color?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: disabled ? 'default' : 'pointer', background: color, color: '#fff', fontFamily: F, opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTICE ROUND FLOW
// ─────────────────────────────────────────────────────────────────────────────
function NoticeRoundFlow({ round: r, caseCreatedAt, onReload, isLast, onAddFurther, actors }: {
  round: any; caseCreatedAt: string; onReload: () => void; isLast: boolean; onAddFurther?: () => void
  actors: Record<string, { id: string; fullName: string; role: string }>
}) {
  const { user } = useAuth()
  const canManagerAct = MANAGER_TIER.includes(user?.role ?? '')
  const canPartnerAct = PARTNER_TIER.includes(user?.role ?? '')
  const [loading, setLoading]             = useState(false)
  const [noticeDateInput, setNoticeDateInput] = useState('')
  const [dueDateInput, setDueDateInput]   = useState('')
  const [comment, setComment]             = useState('')
  const [attachUrl, setAttachUrl]         = useState('')
  const [attachName, setAttachName]       = useState('')
  const [attachUploading, setAttachUploading] = useState(false)

  async function patch(fields: Record<string, any>) {
    setLoading(true)
    try { await api.patch(`/fbr/notice-rounds/${r.id}`, fields); onReload() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
    finally { setLoading(false) }
  }

  async function markDone(field: string, extra?: Record<string, any>) {
    setLoading(true)
    try {
      await api.patch(`/fbr/notice-rounds/${r.id}`, {
        [field]: new Date().toISOString(),
        notes: comment.trim() || undefined,
        ...extra,
      })
      if (attachUrl) {
        await api.post(`/fbr/notice-rounds/${r.id}/attachments`, { url: attachUrl, label: attachName || undefined })
        setAttachUrl(''); setAttachName('')
      }
      setComment('')
      onReload()
    }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
    finally { setLoading(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/sales-tax-tasks/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data?.data?.url ?? res.data?.url
      setAttachUrl(url); setAttachName(file.name)
    } catch { /* silent */ }
    finally { setAttachUploading(false) }
  }

  const noteArea = (
    <NoteArea comment={comment} onComment={setComment}
      attachUrl={attachUrl} attachName={attachName} onClearAttach={() => { setAttachUrl(''); setAttachName('') }}
      attachUploading={attachUploading} onUpload={handleUpload} />
  )

  type S = { key: string; label: string; role: 'Trainee'|'Manager'|'Partner'; done: boolean; doneDate?: string|null; undoField?: Record<string,any>; actorId?: string|null }
  const steps: S[] = [
    { key:'recv',    label:'Notice Received from Client',                        role:'Trainee', done: !!r.noticeDate,              doneDate: r.noticeDate,         undoField: { noticeDate: null, dueDate: null }, actorId: r.noticeLoggedById },
    { key:'action',  label:'Choose Response Action',                             role:'Trainee', done: r.adjournmentApplied || !!r.docListCreatedAt, doneDate: null, undoField: { adjournmentApplied: false }, actorId: r.adjournmentApplied ? r.adjournmentAppliedById : r.docListCreatedById },
    ...(r.adjournmentApplied ? [{ key:'adj', label:'Adjournment Applied',        role:'Trainee' as const, done: true,              doneDate: null,                 undoField: { adjournmentApplied: false }, actorId: r.adjournmentAppliedById }] : []),
    { key:'docList', label:'Document Requirement List Created',                  role:'Trainee', done: !!r.docListCreatedAt,        doneDate: r.docListCreatedAt,   undoField: { docListCreatedAt: null }, actorId: r.docListCreatedById },
    { key:'approve', label:'Document List Reviewed and Approved',                role:'Manager', done: !!r.docListApprovedAt,       doneDate: r.docListApprovedAt,  undoField: { docListApprovedAt: null }, actorId: r.docListApprovedById },
    { key:'draft',   label:'Documents Collected and Draft Reply Prepared',       role:'Trainee', done: !!r.draftPreparedAt,         doneDate: r.draftPreparedAt,    undoField: { draftPreparedAt: null }, actorId: r.draftPreparedById },
    { key:'review',  label:'Internal Review and Comments Incorporated',          role:'Manager', done: !!r.internalReviewedAt,      doneDate: r.internalReviewedAt, undoField: { internalReviewedAt: null }, actorId: r.internalReviewById },
    { key:'partner', label:'Final Approval by Sir Asif',                         role:'Partner', done: !!r.partnerApprovedAt,       doneDate: r.partnerApprovedAt,  undoField: { partnerApprovedAt: null }, actorId: r.partnerApprovedById },
    { key:'submit',  label:`Submitted to FBR${r.submissionMethod ? ` (${r.submissionMethod})` : ''}`, role:'Trainee', done: !!r.submittedAt, doneDate: r.submittedAt, undoField: { submittedAt: null, submissionMethod: null }, actorId: r.submittedById },
  ]

  const curIdx    = steps.findIndex(s => !s.done)
  const allDone   = curIdx === -1
  const isPending = r.outcome === 'PENDING'
  const doneCount = steps.filter(s => s.done).length + (isPending ? 0 : 1)

  return (
    <div>
      <div style={{ borderRadius: 8, background: r.roundNumber===1?'#EFF6FF':'#FFF7ED', border:`1px solid ${r.roundNumber===1?'#BFDBFE':'#FED7AA'}`, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px' }}>
          <div>
            <span style={{ fontWeight:700, fontSize:13, color:NAVY, fontFamily:F }}>Round {r.roundNumber} {r.roundNumber===1?'Fresh Notice':'Further Explanation Notice'}</span>
            {r.dueDate && <div style={{ fontSize:10, color:WARN, fontFamily:F, marginTop:2 }}>Due: {fmt(r.dueDate)}</div>}
          </div>
          <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, fontFamily:F,
            background: isPending?'#FEF9C3': r.outcome==='ACCEPTED'?'#D1FAE5': r.outcome==='FURTHER_NOTICE'?'#DBEAFE':'#FEE2E2',
            color:       isPending?WARN:     r.outcome==='ACCEPTED'?GREEN:      r.outcome==='FURTHER_NOTICE'?'#1E40AF':DANGER }}>
            {isPending?'In Progress': r.outcome==='ACCEPTED'?'Accepted': r.outcome==='FURTHER_NOTICE'?'Further Notice':'Order Against'}
          </span>
        </div>
        <AttachList notes={r.notes} attachments={r.attachments} />
      </div>

      <ProgressBar done={doneCount} total={steps.length + 1} />

      {steps.map((step, idx) => {
        const isDone     = step.done
        const isActive   = !isDone && idx === curIdx
        const isLastDone = isDone && idx === (allDone ? steps.length-1 : curIdx-1) && isPending && !!step.undoField

        return (
          <React.Fragment key={step.key}>
            <StepCard idx={idx} label={step.label} role={step.role} isDone={isDone} isActive={isActive}
              doneDate={step.doneDate} undoable={isLastDone} onUndo={() => patch(step.undoField!)} actionLoading={loading}
              actorName={step.actorId ? actors[step.actorId]?.fullName : undefined}
              noteSection={isActive ? noteArea : undefined}>
              {isActive && step.key==='recv' && (
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                  <div>
                    <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#64748B', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:F }}>Date of Notice</label>
                    <input type="date" value={noticeDateInput} onChange={e => setNoticeDateInput(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:`1.5px solid ${TEAL}`, fontSize:12, fontFamily:F, outline:'none' }} />
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#64748B', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:F }}>Due Date</label>
                    <input type="date" value={dueDateInput} onChange={e => setDueDateInput(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:`1.5px solid ${TEAL}`, fontSize:12, fontFamily:F, outline:'none' }} />
                  </div>
                  <Btn label="Confirm" onClick={async () => {
                    if (noticeDateInput && dueDateInput) {
                      await markDone('noticeDate', { noticeDate: new Date(noticeDateInput).toISOString(), dueDate: new Date(dueDateInput).toISOString() })
                      setNoticeDateInput(''); setDueDateInput('')
                    }
                  }} disabled={loading || !noticeDateInput || !dueDateInput} />
                </div>
              )}
              {isActive && step.key==='action' && (
                <>
                  <Btn label="Apply Adjournment" color={WARN} onClick={() => patch({ adjournmentApplied: true })} disabled={loading} />
                  <Btn label="Skip to Document List" color="#64748B" onClick={() => markDone('docListCreatedAt')} disabled={loading} />
                </>
              )}
              {isActive && step.key==='docList'  && <Btn label="Mark Created"              onClick={() => markDone('docListCreatedAt')}    disabled={loading} />}
              {isActive && step.key==='approve'   && (canManagerAct
                ? <Btn label="Mark Approved"  color={GREEN} onClick={() => markDone('docListApprovedAt')}   disabled={loading} />
                : <WaitingFor label="Manager" />)}
              {isActive && step.key==='draft'     && <Btn label="Mark Done"                 onClick={() => markDone('draftPreparedAt')}     disabled={loading} />}
              {isActive && step.key==='review'    && (canManagerAct
                ? <Btn label="Mark Reviewed"  color={GREEN} onClick={() => markDone('internalReviewedAt')}  disabled={loading} />
                : <WaitingFor label="Manager" />)}
              {isActive && step.key==='partner'   && (canPartnerAct
                ? <Btn label="Approved by Sir Asif" color={WARN} onClick={() => markDone('partnerApprovedAt')} disabled={loading} />
                : <WaitingFor label="Partner" />)}
              {isActive && step.key==='submit'    && (
                <>
                  <Btn label="Submitted on IRIS"   onClick={() => markDone('submittedAt', { submissionMethod:'IRIS' })}   disabled={loading} />
                  <Btn label="Submitted Manually"  color={PURPLE} onClick={() => markDone('submittedAt', { submissionMethod:'MANUAL' })} disabled={loading} />
                </>
              )}
            </StepCard>
            {idx < steps.length-1 && <StepArrow done={isDone} />}
          </React.Fragment>
        )
      })}

      <StepArrow done={allDone} />
      {allDone && isPending && (
        canManagerAct ? (
          <OutcomeStep question="What was the FBR outcome?">
            <Btn label="Reply Accepted"        color={GREEN}   onClick={() => patch({ outcome:'ACCEPTED' })}       disabled={loading} />
            <Btn label="Further Notice Issued" color="#1E40AF" onClick={() => patch({ outcome:'FURTHER_NOTICE' })} disabled={loading} />
            <Btn label="Order Against Client"  color={DANGER}  onClick={() => patch({ outcome:'ORDER_AGAINST' })}  disabled={loading} />
          </OutcomeStep>
        ) : <WaitingFor label="Manager" />
      )}
      {!isPending && (
        <ResultCard
          label={r.outcome==='ACCEPTED'?'Reply Accepted by FBR': r.outcome==='FURTHER_NOTICE'?'Further Explanation Notice Issued':'Order Against Client'}
          color={r.outcome==='ACCEPTED'?GREEN: r.outcome==='FURTHER_NOTICE'?'#1E40AF':DANGER}
          onUndo={() => patch({ outcome:'PENDING' })} loading={loading}
          actorName={r.outcomeById ? actors[r.outcomeById]?.fullName : undefined}
        >
          {r.outcome==='FURTHER_NOTICE' && isLast && onAddFurther && (
            <Btn label={`Start Round ${r.roundNumber+1}`} color={PURPLE} onClick={onAddFurther} disabled={loading} />
          )}
          {r.outcome==='ORDER_AGAINST' && (
            r.challanPaid
              ? <span style={{ fontSize:12, color:GREEN, fontWeight:600, fontFamily:F }}>Tax Demand Paid</span>
              : <Btn label="Mark Tax Demand Paid" color={GREEN} onClick={() => patch({ challanPaid:true, challanPaidAt:new Date().toISOString() })} disabled={loading} />
          )}
        </ResultCard>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// APPEAL FLOW
// ─────────────────────────────────────────────────────────────────────────────
function AppealFlow({ appeal: a, caseId, onReload, actors }: { appeal: any; caseId: string; onReload: () => void; actors: Record<string, { id: string; fullName: string; role: string }> }) {
  const { user } = useAuth()
  const canManagerAct = MANAGER_TIER.includes(user?.role ?? '')
  const canPartnerAct = PARTNER_TIER.includes(user?.role ?? '')
  const [loading, setLoading]             = useState(false)
  const [hearingDate, setHearingDate]     = useState('')
  const [showHearing, setShowHearing]     = useState(false)
  const [comment, setComment]             = useState('')
  const [attachUrl, setAttachUrl]         = useState('')
  const [attachName, setAttachName]       = useState('')
  const [attachUploading, setAttachUploading] = useState(false)

  async function patch(fields: Record<string, any>) {
    setLoading(true)
    try { await api.patch(`/fbr/appeals/${a.id}`, fields); onReload() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
    finally { setLoading(false) }
  }

  async function markDone(field: string, extra?: Record<string, any>) {
    setLoading(true)
    try {
      await api.patch(`/fbr/appeals/${a.id}`, {
        [field]: new Date().toISOString(),
        notes: comment.trim() || undefined,
        ...extra,
      })
      if (attachUrl) {
        await api.post(`/fbr/appeals/${a.id}/attachments`, { url: attachUrl, label: attachName || undefined })
        setAttachUrl(''); setAttachName('')
      }
      setComment('')
      onReload()
    }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
    finally { setLoading(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/sales-tax-tasks/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data?.data?.url ?? res.data?.url
      setAttachUrl(url); setAttachName(file.name)
    } catch { /* silent */ }
    finally { setAttachUploading(false) }
  }

  const noteArea = (
    <NoteArea comment={comment} onComment={setComment}
      attachUrl={attachUrl} attachName={attachName} onClearAttach={() => { setAttachUrl(''); setAttachName('') }}
      attachUploading={attachUploading} onUpload={handleUpload} />
  )

  type S = { key: string; label: string; role: 'Trainee'|'Manager'|'Partner'; done: boolean; doneDate?: string|null; undoField?: Record<string,any>; actorId?: string|null }
  const steps: S[] = [
    { key:'recv',    label:'Commissioner Order Received',                               role:'Manager', done: true,                    doneDate: a.createdAt },
    { key:'due',     label:'Due Date Check (30 days from order)',                       role:'Trainee', done: true,                    doneDate: null },
    ...(a.isLate ? [{ key:'cond', label:'Condonation of Delay Application Filed',      role:'Trainee' as const, done: !!a.condonationFiled, doneDate: null, undoField: { condonationFiled: false }, actorId: a.condonationFiledById }] : []),
    { key:'grounds', label:'Fee Challan Prepared and Grounds of Appeal Drafted',        role:'Trainee', done: !!a.groundsPreparedAt,   doneDate: a.groundsPreparedAt, undoField: { groundsPreparedAt: null }, actorId: a.groundsPreparedById },
    { key:'review',  label:'Internal Review by Senior',                                 role:'Manager', done: !!a.internalReviewedAt,  doneDate: a.internalReviewedAt, undoField: { internalReviewedAt: null }, actorId: a.internalReviewById },
    { key:'partner', label:'Final Approval by Sir Asif',                                role:'Partner', done: !!a.partnerApprovedAt,   doneDate: a.partnerApprovedAt,  undoField: { partnerApprovedAt: null }, actorId: a.partnerApprovedById },
    { key:'submit',  label:`Appeal Submitted${a.submissionMethod ? ` (${a.submissionMethod})` : ''}`, role:'Trainee', done: !!a.submittedAt, doneDate: a.submittedAt, undoField: { submittedAt: null, submissionMethod: null }, actorId: a.submittedById },
    { key:'hearing', label:'Hearing Date Scheduled',                                    role:'Manager', done: (a.hearings?.length ?? 0) > 0, doneDate: a.hearings?.[0]?.scheduledDate, actorId: a.hearings?.[0]?.createdById },
  ]

  const curIdx    = steps.findIndex(s => !s.done)
  const allDone   = curIdx === -1
  const isPending = a.outcome === 'PENDING'
  const doneCount = steps.filter(s => s.done).length + (isPending ? 0 : 1)

  return (
    <div>
      <div style={{ borderRadius: 8, background: '#FAF5FF', border: '1px solid #DDD6FE', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '8px 12px' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: PURPLE, fontFamily: F }}>
            Appeal: {a.appealType === 'CIR_APPEALS' ? 'CIR (Appeals)' : 'ATIR'}
            {a.isLate ? ' (Late Filing)' : ''}
          </span>
        </div>
        <AttachList notes={a.notes} attachments={a.attachments} />
      </div>

      <ProgressBar done={doneCount} total={steps.length + 1} color={PURPLE} />
      {steps.map((step, idx) => {
        const isDone     = step.done
        const isActive   = !isDone && idx === curIdx
        const isLastDone = isDone && idx === (allDone ? steps.length-1 : curIdx-1) && isPending && !!step.undoField

        return (
          <React.Fragment key={step.key}>
            <StepCard idx={idx} label={step.label} role={step.role} isDone={isDone} isActive={isActive}
              doneDate={step.doneDate} undoable={isLastDone} onUndo={() => patch(step.undoField!)} actionLoading={loading}
              actorName={step.actorId ? actors[step.actorId]?.fullName : undefined}
              noteSection={isActive && step.key !== 'hearing' ? noteArea : undefined}>
              {isActive && step.key==='cond'    && <Btn label="Condonation Filed" color={DANGER} onClick={() => patch({ condonationFiled:true })} disabled={loading} />}
              {isActive && step.key==='grounds' && (
                <>
                  <Btn label="Grounds Ready (IRIS)"   onClick={() => markDone('groundsPreparedAt')}              disabled={loading} />
                  <Btn label="Grounds and POA Ready"  color={PURPLE} onClick={() => markDone('groundsPreparedAt')} disabled={loading} />
                </>
              )}
              {isActive && step.key==='review'  && (canManagerAct
                ? <Btn label="Mark Reviewed" color={GREEN} onClick={() => markDone('internalReviewedAt')} disabled={loading} />
                : <WaitingFor label="Manager" />)}
              {isActive && step.key==='partner' && (canPartnerAct
                ? <Btn label="Approved by Sir Asif" color={WARN} onClick={() => markDone('partnerApprovedAt')} disabled={loading} />
                : <WaitingFor label="Partner" />)}
              {isActive && step.key==='submit'  && (
                <>
                  <Btn label="Submitted on IRIS"  onClick={() => markDone('submittedAt', { submissionMethod:'IRIS' })}   disabled={loading} />
                  <Btn label="Submitted Manually" color={PURPLE} onClick={() => markDone('submittedAt', { submissionMethod:'MANUAL' })} disabled={loading} />
                </>
              )}
              {isActive && step.key==='hearing' && (
                <div style={{ width:'100%' }}>
                  {(a.hearings ?? []).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      {a.hearings.map((h: any) => (
                        <div key={h.id} style={{ fontSize:11, fontFamily:F, padding:'4px 8px', background:'#F0F9FF', borderRadius:6, marginBottom:4, display:'flex', gap:8, border:'1px solid #BAE6FD' }}>
                          <span>{fmt(h.scheduledDate)}</span>
                          <span style={{ fontWeight:700, color: h.outcome==='DECIDED'?GREEN:WARN }}>{h.outcome}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!canManagerAct ? (
                    <WaitingFor label="Manager" />
                  ) : showHearing ? (
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
                      <input type="date" value={hearingDate} onChange={e => setHearingDate(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:`1.5px solid ${TEAL}`, fontSize:12, fontFamily:F, outline:'none' }} />
                      <Btn label="Add Hearing" onClick={async () => {
                        if (!hearingDate) return
                        setLoading(true)
                        try { await api.post(`/fbr/cases/${caseId}/hearings`, { scheduledDate: hearingDate, appealId: a.id }); setShowHearing(false); setHearingDate(''); onReload() }
                        catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
                        finally { setLoading(false) }
                      }} disabled={loading} />
                      <Btn label="Cancel" color="#64748B" onClick={() => setShowHearing(false)} />
                    </div>
                  ) : (
                    <Btn label="Add Hearing Date" onClick={() => setShowHearing(true)} />
                  )}
                </div>
              )}
            </StepCard>
            {idx < steps.length-1 && <StepArrow done={isDone} />}
          </React.Fragment>
        )
      })}

      <StepArrow done={allDone} />
      {allDone && isPending && (
        canManagerAct ? (
          <OutcomeStep question="What was the appeal order?">
            <Btn label="Decided in Favour of Client" color={GREEN}  onClick={() => patch({ outcome:'IN_FAVOR', orderDate: new Date().toISOString() })} disabled={loading} />
            <Btn label="Order Against Client"         color={DANGER} onClick={() => patch({ outcome:'AGAINST',  orderDate: new Date().toISOString() })} disabled={loading} />
          </OutcomeStep>
        ) : <WaitingFor label="Manager" />
      )}
      {!isPending && (
        <ResultCard
          label={a.outcome==='IN_FAVOR'?'Appeal Decided in Favour of Client':'Appeal Decided Against Client'}
          color={a.outcome==='IN_FAVOR'?GREEN:DANGER}
          onUndo={() => patch({ outcome:'PENDING', orderDate:null })} loading={loading}
          actorName={a.outcomeById ? actors[a.outcomeById]?.fullName : undefined}
        >
          {a.outcome==='AGAINST' && !a.challanPaid && <Btn label="Mark Tax Demand Paid" color={GREEN} onClick={() => patch({ challanPaid:true, challanPaidAt:new Date().toISOString() })} disabled={loading} />}
          {a.outcome==='AGAINST' &&  a.challanPaid && <span style={{ fontSize:12, color:GREEN, fontWeight:600, fontFamily:F }}>Tax Demand Paid</span>}
        </ResultCard>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STAY FLOW
// ─────────────────────────────────────────────────────────────────────────────
function StayFlow({ stay: s, onReload, actors }: { stay: any; onReload: () => void; actors: Record<string, { id: string; fullName: string; role: string }> }) {
  const { user } = useAuth()
  const canManagerAct = MANAGER_TIER.includes(user?.role ?? '')
  const [loading, setLoading]             = useState(false)
  const [comment, setComment]             = useState('')
  const [attachUrl, setAttachUrl]         = useState('')
  const [attachName, setAttachName]       = useState('')
  const [attachUploading, setAttachUploading] = useState(false)

  async function patch(fields: Record<string, any>) {
    setLoading(true)
    try { await api.patch(`/fbr/stays/${s.id}`, fields); onReload() }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
    finally { setLoading(false) }
  }

  async function markDone(fields: Record<string, any>) {
    setLoading(true)
    try {
      await api.patch(`/fbr/stays/${s.id}`, { notes: comment.trim() || undefined, ...fields })
      if (attachUrl) {
        await api.post(`/fbr/stays/${s.id}/attachments`, { url: attachUrl, label: attachName || undefined })
        setAttachUrl(''); setAttachName('')
      }
      setComment('')
      onReload()
    }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed') }
    finally { setLoading(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/sales-tax-tasks/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data?.data?.url ?? res.data?.url
      setAttachUrl(url); setAttachName(file.name)
    } catch { /* silent */ }
    finally { setAttachUploading(false) }
  }

  const noteArea = (
    <NoteArea comment={comment} onComment={setComment}
      attachUrl={attachUrl} attachName={attachName} onClearAttach={() => { setAttachUrl(''); setAttachName('') }}
      attachUploading={attachUploading} onUpload={handleUpload} />
  )

  type S = { key: string; label: string; role: 'Trainee'|'Manager'|'Partner'; done: boolean; doneDate?: string|null; undoField?: Record<string,any>; actorId?: string|null }
  const steps: S[] = [
    { key:'recv',   label:'Recovery Notice Received from Client',       role:'Manager', done: true,            doneDate: s.triggeredAt ?? s.createdAt },
    { key:'review', label:'Stay Application Prepared and Reviewed',     role:'Manager', done: !!s.reviewedAt,  doneDate: s.reviewedAt,  undoField: { reviewedAt: null }, actorId: s.reviewedById },
    { key:'submit', label:`Application Submitted${s.submissionMethod ? ` (${s.submissionMethod})` : ''}`, role:'Trainee', done: !!s.submittedAt, doneDate: s.submittedAt, undoField: { submittedAt: null }, actorId: s.submittedById },
  ]

  const curIdx    = steps.findIndex(st => !st.done)
  const allDone   = curIdx === -1
  const isPending = s.outcome === 'PENDING'
  const doneCount = steps.filter(st => st.done).length + (isPending ? 0 : 1)

  return (
    <div>
      <div style={{ borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '8px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7F1D1D', fontFamily: F }}>
            Emergency Stay Application
          </div>
          <div style={{ fontSize: 11, color: '#B91C1C', fontFamily: F, marginTop: 2 }}>
            Main case workflow is paused while this Stay Application is pending.
            {s.reason && <span style={{ fontStyle: 'italic' }}> Reason: {s.reason}</span>}
          </div>
        </div>
        <AttachList notes={s.notes} attachments={s.attachments} />
      </div>

      <ProgressBar done={doneCount} total={steps.length + 1} color={DANGER} />

      {steps.map((step, idx) => {
        const isDone     = step.done
        const isActive   = !isDone && idx === curIdx
        const isLastDone = isDone && idx === (allDone ? steps.length-1 : curIdx-1) && isPending && !!step.undoField

        return (
          <React.Fragment key={step.key}>
            <StepCard idx={idx} label={step.label} role={step.role} isDone={isDone} isActive={isActive}
              doneDate={step.doneDate} undoable={isLastDone} onUndo={() => patch(step.undoField!)} actionLoading={loading}
              actorName={step.actorId ? actors[step.actorId]?.fullName : undefined}
              noteSection={isActive ? noteArea : undefined}>
              {isActive && step.key==='review' && (canManagerAct
                ? <Btn label="Mark Prepared and Reviewed" color={GREEN} onClick={() => markDone({ reviewedAt: new Date().toISOString() })} disabled={loading} />
                : <WaitingFor label="Manager" />)}
              {isActive && step.key==='submit' && (
                <>
                  <Btn label="Submitted (IRIS)"   onClick={() => markDone({ submittedAt: new Date().toISOString(), submissionMethod:'IRIS' })}   disabled={loading} />
                  <Btn label="Submitted (Manual)" color={PURPLE} onClick={() => markDone({ submittedAt: new Date().toISOString(), submissionMethod:'MANUAL' })} disabled={loading} />
                </>
              )}
            </StepCard>
            {idx < steps.length-1 && <StepArrow done={isDone} />}
          </React.Fragment>
        )
      })}

      <StepArrow done={allDone} />
      {allDone && isPending && (
        canManagerAct ? (
          <OutcomeStep question="What was the outcome of the Stay Application?">
            <Btn label="Stay Granted"  color={GREEN}  onClick={() => patch({ outcome:'GRANTED',  decidedAt: new Date().toISOString() })} disabled={loading} />
            <Btn label="Stay Rejected" color={DANGER} onClick={() => patch({ outcome:'REJECTED', decidedAt: new Date().toISOString() })} disabled={loading} />
          </OutcomeStep>
        ) : <WaitingFor label="Manager" />
      )}
      {!isPending && (
        <ResultCard
          label={s.outcome==='GRANTED'?'Stay Granted, FBR Recovery Stopped':'Stay Rejected, FBR Recovery Proceeds'}
          color={s.outcome==='GRANTED'?GREEN:DANGER}
          onUndo={() => patch({ outcome:'PENDING', decidedAt:null })} loading={loading}
          actorName={s.outcomeById ? actors[s.outcomeById]?.fullName : undefined}
        >
          {s.outcome==='GRANTED' && (
            !s.resumedAt
              ? <Btn label="Resume Main Workflow" color={TEAL} onClick={async () => { setLoading(true); try { await api.post(`/fbr/stays/${s.id}/resume`); onReload() } catch {} finally { setLoading(false) } }} disabled={loading} />
              : <span style={{ fontSize:12, color:GREEN, fontWeight:600, fontFamily:F }}>Main workflow resumed on {fmt(s.resumedAt)}</span>
          )}
        </ResultCard>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function FbrCaseDetail({ case: c, onUpdated, onReload, onMarkIncomplete, onDelete }: { case: any; onUpdated: (u: any) => void; onReload: () => void; onMarkIncomplete?: () => void; onDelete?: () => void }) {
  const [tab, setTab] = useState<'notice'|'appeal'|'stay'>('notice')
  const [showStay, setShowStay] = useState(false)
  const [stayReason, setStayReason] = useState('')
  const [showClose, setShowClose] = useState(false)
  const [closeReason, setCloseReason] = useState('')

  const hasAppeal = !!c.appeal
  const hasStay   = (c.stayApplications?.length ?? 0) > 0
  const lastRound = c.noticeRounds?.[c.noticeRounds.length - 1]
  const canAppeal = lastRound?.outcome === 'ORDER_AGAINST' && !hasAppeal

  async function addRound()  { await api.post(`/fbr/cases/${c.id}/notice-rounds`, {}); onReload() }
  async function addAppeal() { await api.post(`/fbr/cases/${c.id}/appeal`, {}); onReload(); setTab('appeal') }
  async function fileStay()  {
    if (!stayReason.trim()) return
    await api.post(`/fbr/cases/${c.id}/stay`, { reason: stayReason })
    setShowStay(false); setStayReason(''); onReload(); setTab('stay')
  }
  async function closeCase() {
    if (!closeReason.trim()) return
    await api.post(`/fbr/cases/${c.id}/close`, { reason: closeReason })
    setShowClose(false); onReload()
  }

  const activeTab = (tab==='appeal' && !hasAppeal) || (tab==='stay' && !hasStay) ? 'notice' : tab

  const TABS = [
    { key:'notice', label:`Notice Stage${(c.noticeRounds?.length ?? 0) > 1 ? ` (${c.noticeRounds.length})` : ''}`, color: NAVY },
    { key:'appeal', label:'Appeal Stage',                                                                             color: PURPLE, off: !hasAppeal },
    { key:'stay',   label:`Stay${hasStay ? ` (${c.stayApplications.length})` : ''}`,                                color: DANGER, off: !hasStay },
  ]

  return (
    <div style={{ padding: '12px 16px', fontFamily: F }}>

      {/* Case header */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', margin: '0 0 14px' }}>
        <div style={{ padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em' }}>
              {(c.client?.businessName ?? c.client?.user?.fullName ?? '').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() || 'N'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY, letterSpacing: '-0.02em', lineHeight: 1.2, fontFamily: F }}>
                  {c.client?.businessName ?? c.client?.user?.fullName}
                </h2>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: c.currentStage==='CLOSED'?'#DCFCE7':'#FEF3C7', color: c.currentStage==='CLOSED'?GREEN:WARN, fontFamily: F, flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.currentStage==='CLOSED'?'#16a34a':'#F59E0B', flexShrink: 0 }} />
                  {c.currentStage==='CLOSED' ? 'Closed' : 'Active'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B', fontFamily: F }}>Notices &amp; Appeals</p>
            </div>
          </div>

          <div style={{ height: 1, background: '#F1F5F9', margin: '12px 0' }} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 10 }}>
            {c.taxType && (
              <span style={{ fontSize: 11, color: '#334155', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '3px 10px', borderRadius: 6, fontFamily: F, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Type: </span>&nbsp;{c.taxType.replace(/_/g,' ')}
              </span>
            )}
            {c.entryPoint && (
              <span style={{ fontSize: 11, color: '#334155', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '3px 10px', borderRadius: 6, fontFamily: F, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Entry: </span>&nbsp;{c.entryPoint.replace(/_/g,' ')}
              </span>
            )}
            {c.noticeSection && (
              <span style={{ fontSize: 11, color: '#334155', background: '#F0FAFB', border: '1px solid #A5F3FC', padding: '3px 10px', borderRadius: 6, fontFamily: F, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Section: </span>&nbsp;{c.noticeSection}
              </span>
            )}
            {c.taxYear && (
              <span style={{ fontSize: 11, color: '#334155', background: '#F0FAFB', border: '1px solid #A5F3FC', padding: '3px 10px', borderRadius: 6, fontFamily: F, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Year: </span>&nbsp;{c.taxYear}
              </span>
            )}
            {c.noticeNumber && (
              <span style={{ fontSize: 11, color: '#334155', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '3px 10px', borderRadius: 6, fontFamily: F, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Notice: </span>&nbsp;{c.noticeNumber}
              </span>
            )}
            {c.assignedTo?.fullName && (
              <span style={{ fontSize: 11, color: '#334155', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '3px 10px', borderRadius: 6, fontFamily: F, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Assigned: </span>&nbsp;{c.assignedTo.fullName}
              </span>
            )}
            {c.currentStage !== 'CLOSED' && (<>
              {canAppeal && <button onClick={addAppeal} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${PURPLE}`, background: '#FAF5FF', color: PURPLE, fontFamily: F, lineHeight: 1 }}>File Appeal</button>}
              <button onClick={() => setShowStay(true)}  style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${DANGER}`, background: '#FEF2F2', color: DANGER,    fontFamily: F, lineHeight: 1 }}>File Stay</button>
              <button onClick={() => setShowClose(true)} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid #94A3B8',  background: '#F8FAFC',   color: '#64748B', fontFamily: F, lineHeight: 1 }}>Close Case</button>
            </>)}
            {onMarkIncomplete && c.currentStage === 'CLOSED' && (
              <button onClick={onMarkIncomplete} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px dashed #D97706', background: '#FFFBEB', color: '#D97706', fontFamily: F, lineHeight: 1 }}>↩ Mark Incomplete</button>
            )}
            {onDelete && (
              <button onClick={onDelete} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px dashed #DC2626', background: '#FEF2F2', color: '#DC2626', fontFamily: F, lineHeight: 1 }}>🗑 Delete Case</button>
            )}
          </div>
        </div>
      </div>

      {/* Stay form */}
      {showStay && (
        <div style={{ marginBottom: 12, padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: DANGER, marginBottom: 8, fontFamily: F }}>File Stay Application</div>
          <textarea value={stayReason} onChange={e => setStayReason(e.target.value)} rows={2} placeholder="Reason for stay (recovery notice details)"
            style={{ width: '100%', boxSizing: 'border-box' as const, padding: '7px 10px', borderRadius: 6, border: '1px solid #FECACA', fontSize: 12, fontFamily: F, outline: 'none', resize: 'vertical' as const, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn label="File Stay" color={DANGER} onClick={fileStay} />
            <Btn label="Cancel"    color="#64748B" onClick={() => setShowStay(false)} />
          </div>
        </div>
      )}
      {showClose && (
        <div style={{ marginBottom: 12, padding: '12px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8, fontFamily: F }}>Close Case</div>
          <input value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Reason for closing"
            style={{ width: '100%', boxSizing: 'border-box' as const, padding: '7px 10px', borderRadius: 6, border: '1px solid #BBF7D0', fontSize: 12, fontFamily: F, outline: 'none', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn label="Close Case" color={GREEN}   onClick={closeCase} />
            <Btn label="Cancel"     color="#64748B" onClick={() => setShowClose(false)} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 3 }}>
          {TABS.map(t => {
            const active = activeTab === t.key
            return (
              <button key={t.key} onClick={() => !(t as any).off && setTab(t.key as any)} disabled={!!(t as any).off}
                style={{ padding: '5px 20px', borderRadius: 6, cursor: (t as any).off?'default':'pointer', fontFamily: F, fontSize: 12, fontWeight: active?700:500, border: 'none', background: active?t.color:'transparent', color: active?'#fff':(t as any).off?'#CBD5E1':'#5C5C5C', whiteSpace: 'nowrap' as const, transition: 'all .15s' }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, height: 3, marginBottom: 14 }}>
        {TABS.map(t => <div key={t.key} style={{ flex: 1, background: t.color, borderRadius: 2, opacity: activeTab===t.key?1:0.3, transition: 'opacity .2s' }} />)}
      </div>

      {/* Content */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        {activeTab==='notice' && (
          <>
            {!(c.noticeRounds?.length) && (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12, fontFamily: F }}>No notice rounds yet</div>
                <Btn label="Create Notice Round" color={NAVY} onClick={addRound} />
              </div>
            )}
            {(c.noticeRounds ?? []).map((r: any, i: number) => (
              <div key={r.id} style={{ marginBottom: i < c.noticeRounds.length-1 ? 32 : 0 }}>
                {i > 0 && <div style={{ height: 1, background: '#F1F5F9', margin: '0 0 24px' }} />}
                <NoticeRoundFlow round={r} caseCreatedAt={c.createdAt} onReload={onReload} isLast={i===c.noticeRounds.length-1} onAddFurther={i===c.noticeRounds.length-1 ? addRound : undefined} actors={c.actors ?? {}} />
              </div>
            ))}
          </>
        )}
        {activeTab==='appeal' && c.appeal && <AppealFlow appeal={c.appeal} caseId={c.id} onReload={onReload} actors={c.actors ?? {}} />}
        {activeTab==='stay'   && hasStay   && (c.stayApplications ?? []).map((s: any, i: number) => (
          <div key={s.id} style={{ marginBottom: i < c.stayApplications.length-1 ? 24 : 0 }}>
            {i > 0 && <div style={{ height: 1, background: '#F1F5F9', margin: '0 0 20px' }} />}
            <StayFlow stay={s} onReload={onReload} actors={c.actors ?? {}} />
          </div>
        ))}
      </div>

      {canAppeal && !hasAppeal && (
        <div style={{ marginTop: 14, background: '#FAF5FF', border: '2px dashed #C4B5FD', borderRadius: 12, padding: '14px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: PURPLE, fontWeight: 700, marginBottom: 10, fontFamily: F }}>Order Against Client, Appeal can now be filed</div>
          <Btn label="File Appeal with CIR (Appeals) or ATIR" color={PURPLE} onClick={addAppeal} />
        </div>
      )}
    </div>
  )
}
