'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import MultiSelect from '@/components/ui/MultiSelect'
import { F, TEAL, TASK_TYPES, PanelHeader, inputStyle, labelStyle, btn } from './auditShared'

// A manager raises the engagement and names the team on the same screen, because
// an audit without a team allocated is not yet a job anybody can start.
//
// `embedded` drops the page chrome so the same form can open from the New Task
// button in the sidebar, the way the tax form does. `selfOnly` is for a team
// lead or trainee raising their own job: they name no team, the server puts
// the work on them and sends the review to whoever they report to.
export default function NewEngagementPanel({ onClose, onSaved, embedded = false, selfOnly = false }: {
  onClose: () => void
  onSaved: (id: string) => void
  embedded?: boolean
  selfOnly?: boolean
}) {
  const [clients,  setClients]  = useState<any[]>([])
  const [staff,    setStaff]    = useState<any[]>([])

  const [clientId,   setClientId]   = useState('')
  const [taskType,   setTaskType]   = useState('EXTERNAL_AUDIT')
  const [title,      setTitle]      = useState('')
  const [periodEnd,  setPeriodEnd]  = useState('')
  const [periodLabel,setPeriodLabel]= useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [teamLeadId, setTeamLeadId] = useState('')
  const [memberIds,  setMemberIds]  = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    api.get('/tasks/clients').then(({ data }) => setClients(data.data ?? data ?? [])).catch(() => setClients([]))
    api.get('/audit/staff').then(({ data }) => setStaff(data.data ?? data ?? [])).catch(() => setStaff([]))
  }, [])

  // FS Preparation and General are normally one person, so the team block is
  // only offered where a team actually makes sense.
  const isTeamJob = !selfOnly && (taskType === 'EXTERNAL_AUDIT' || taskType === 'INTERNAL_AUDIT')

  // The grids size themselves to the space they are given, so the same form
  // works full width on the Audit page and inside the sidebar modal on a phone.
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 16 }
  const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14, marginBottom: 16 }

  async function save() {
    if (!clientId)  { setError('Pick a client'); return }
    if (!title.trim()) { setError('Give the engagement a title'); return }
    if (!periodEnd) { setError('Set the period end date'); return }

    setSaving(true); setError('')
    try {
      const { data } = await api.post('/audit/engagements', {
        clientId, taskType, title: title.trim(),
        periodEndDate: periodEnd,
        periodLabel: periodLabel.trim() || undefined,
        dueDate: dueDate || undefined,
        // A self-raised job names nobody: the server puts it on the person who
        // raised it and routes the review to whoever they report to.
        teamLeadId: selfOnly ? undefined : (teamLeadId || undefined),
        memberIds: isTeamJob ? memberIds : [],
      })
      const created = data?.data ?? data
      onSaved(created.id)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not create the engagement')
    } finally { setSaving(false) }
  }

  const body = (
    <>
        <div style={{ padding: embedded ? '4px 0 0' : 20 }}>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Client <span style={{ color: '#ef4444' }}>*</span></label>
              <StyledSelect value={clientId} onChange={setClientId} placeholder="Select client…"
                options={clients.map((c: any) => ({ value: c.id, label: c.businessName ?? c.fullName ?? c.user?.fullName ?? '' }))} />
              {/* An empty list means no client is on the audit book yet, which is
                  a switch on the client rather than anything wrong here */}
              {clients.length === 0 && (
                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#ef4444', fontFamily: F }}>
                  No client has Audit Services switched on yet. Open Clients, turn Audit Services on for a client, then come back.
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Task Type <span style={{ color: '#ef4444' }}>*</span></label>
              <StyledSelect value={taskType} onChange={setTaskType} options={TASK_TYPES} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Statutory audit for the year ended 30 June 2026" style={inputStyle} autoFocus />
          </div>

          <div style={grid4}>
            <div>
              <label style={labelStyle}>Period End <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Period Label</label>
              <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="FY 2026" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Team. A self-raised job has none: it is the person's own work and
              the review goes to whoever they report to. */}
          {!selfOnly && (
            <>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>
                TEAM
              </div>
              <div style={{ marginBottom: 14, maxWidth: 360 }}>
                <label style={labelStyle}>Team Lead</label>
                <StyledSelect value={teamLeadId} onChange={setTeamLeadId} placeholder="Select team lead…"
                  options={staff.map((s: any) => ({ value: s.id, label: s.fullName }))} />
              </div>
            </>
          )}

          {selfOnly ? (
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>
              This is your own job. It lands on you to work on and goes to your reviewer when you submit it.
            </p>
          ) : isTeamJob ? (
            <div style={{ maxWidth: 360 }}>
              <label style={labelStyle}>Team Members</label>
              {/* One dropdown rather than every name laid out on the form. Tick
                  people off in the list and they land in the box above it. */}
              <MultiSelect
                values={memberIds}
                onChange={setMemberIds}
                placeholder="Add team members…"
                emptyText="Nobody is in the Audit department yet"
                options={staff.filter((s: any) => s.id !== teamLeadId)
                  .map((s: any) => ({ value: s.id, label: s.fullName }))}
              />
              <p style={{ margin: '5px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: F }}>
                {staff.length === 0
                  ? 'Set a user’s department to Audit in Settings first.'
                  : 'The team lead allocates heads to whoever is on the team.'}
              </p>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>
              {TASK_TYPES.find(t => t.value === taskType)?.label} is normally handled by one person, so no wider team is needed.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '14px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingBottom: embedded ? 16 : 0 }}>
            <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </div>
    </>
  )

  // Inside the sidebar modal the overlay and header belong to the caller, the
  // same way the tax form works there.
  if (embedded) return <div style={{ fontFamily: F }}>{body}</div>

  return (
    <div style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, color: TEAL }}>Tasks</h1>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
        <PanelHeader title="New Task" onBack={onClose} />
        {body}
      </div>
    </div>
  )
}
