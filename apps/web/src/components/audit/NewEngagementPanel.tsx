'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import ModalHeader from '@/components/ui/ModalHeader'
import StyledSelect from '@/components/ui/StyledSelect'
import MultiSelect from '@/components/ui/MultiSelect'
import { TASK_TYPES } from './auditShared'

// The tax New Task popup's own measurements and colours, copied rather than
// referenced because they live inside that component. One firm, one popup.
const NAVY = '#132E57'
const GOLD = '#F2AC18'
const F    = "'Aptos', sans-serif"

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#808080',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  fontFamily: F, marginBottom: 5,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: F,
  outline: 'none', color: NAVY, background: '#fff',
}

// Raising an audit task. Opened from the New Task button in the sidebar, in the
// same popup the tax form opens in.
//
// `selfOnly` is for a team lead or trainee raising their own job: they name no
// team, the server puts the work on them and sends the review to whoever they
// report to.
export default function NewEngagementPanel({ onClose, onSaved, selfOnly = false }: {
  onClose: () => void
  onSaved: (id: string) => void
  selfOnly?: boolean
}) {
  const [clients, setClients] = useState<any[]>([])
  const [staff,   setStaff]   = useState<any[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)

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
    api.get('/tasks/clients')
      .then(({ data }) => setClients(data.data ?? data ?? []))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false))
    api.get('/audit/staff').then(({ data }) => setStaff(data.data ?? data ?? [])).catch(() => setStaff([]))
  }, [])

  // FS Preparation and General are normally one person, so the team block is
  // only offered where a team actually makes sense.
  const isTeamJob = !selfOnly && (taskType === 'EXTERNAL_AUDIT' || taskType === 'INTERNAL_AUDIT')

  const canSubmit = !saving && !!clientId && !!title.trim() && !!periodEnd

  async function save() {
    if (!clientId)     { setError('Pick a client'); return }
    if (!title.trim()) { setError('Give the task a title'); return }
    if (!periodEnd)    { setError('Set the period end date'); return }

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
      setError(e?.response?.data?.message ?? 'Could not create the task')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <ModalHeader title="New Task" onClose={onClose} radius={16} />

        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: 1, fontFamily: F }}>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Task Type <span style={{ color: '#D62828' }}>*</span></label>
            <StyledSelect value={taskType} onChange={setTaskType} options={TASK_TYPES} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Client <span style={{ color: '#D62828' }}>*</span></label>
            <StyledSelect value={clientId} onChange={setClientId} placeholder="Select client…" loading={clientsLoading}
              options={clients.map((c: any) => ({ value: c.id, label: c.businessName ?? c.fullName ?? c.user?.fullName ?? '' }))} />
            {/* An empty list means no client is on the audit book yet, which is
                a switch on the client rather than anything wrong here */}
            {!clientsLoading && clients.length === 0 && (
              <p style={{ margin: '5px 0 0', fontSize: 11, color: '#D62828' }}>
                No client has Audit Services switched on yet. Open Clients, turn Audit Services on for a client, then come back.
              </p>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title <span style={{ color: '#D62828' }}>*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Statutory audit for the year ended 30 June 2026" style={inputStyle} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Period End <span style={{ color: '#D62828' }}>*</span></label>
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
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Team Lead</label>
              <StyledSelect value={teamLeadId} onChange={setTeamLeadId} placeholder="Select team lead…"
                options={staff.map((s: any) => ({ value: s.id, label: s.fullName }))} />
            </div>
          )}

          {selfOnly ? (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#808080' }}>
              This is your own job. It lands on you to work on and goes to your reviewer when you submit it.
            </p>
          ) : isTeamJob ? (
            <div style={{ marginBottom: 16 }}>
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
              <p style={{ margin: '5px 0 0', fontSize: 11, color: '#808080' }}>
                {staff.length === 0
                  ? 'Set a user’s department to Audit in Settings first.'
                  : 'The team lead allocates heads to whoever is on the team.'}
              </p>
            </div>
          ) : (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#808080' }}>
              {TASK_TYPES.find(t => t.value === taskType)?.label} is normally handled by one person, so no wider team is needed.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: '#D62828', margin: '0 0 14px' }}>{error}</p>}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid #E0DDD5', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#FAFBFC', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1.5px solid ${GOLD}`, background: '#fff', color: NAVY, cursor: 'pointer', fontFamily: F }}>
            Cancel
          </button>
          <button onClick={save} disabled={!canSubmit} style={{
            padding: '9px 22px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
            cursor: canSubmit ? 'pointer' : 'default',
            background: GOLD, color: NAVY, fontFamily: F,
            opacity: canSubmit ? 1 : 0.6,
          }}>
            {saving ? 'Saving…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
