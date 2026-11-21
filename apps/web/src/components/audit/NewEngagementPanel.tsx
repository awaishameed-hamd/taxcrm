'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { F, NAVY, TEAL, TASK_TYPES, PanelHeader, inputStyle, labelStyle, btn } from './auditShared'

// A manager raises the engagement and names the team on the same screen, because
// an audit without a team allocated is not yet a job anybody can start.
export default function NewEngagementPanel({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [clients,  setClients]  = useState<any[]>([])
  const [staff,    setStaff]    = useState<any[]>([])

  const [clientId,   setClientId]   = useState('')
  const [taskType,   setTaskType]   = useState('EXTERNAL_AUDIT')
  const [title,      setTitle]      = useState('')
  const [periodEnd,  setPeriodEnd]  = useState('')
  const [periodLabel,setPeriodLabel]= useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [materiality,setMateriality]= useState('')
  const [teamLeadId, setTeamLeadId] = useState('')
  const [memberIds,  setMemberIds]  = useState<string[]>([])
  const [description,setDescription]= useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    api.get('/tasks/clients').then(({ data }) => setClients(data.data ?? data ?? [])).catch(() => setClients([]))
    api.get('/audit/staff').then(({ data }) => setStaff(data.data ?? data ?? [])).catch(() => setStaff([]))
  }, [])

  // FS Preparation and General are normally one person, so the team block is
  // only offered where a team actually makes sense.
  const isTeamJob = taskType === 'EXTERNAL_AUDIT' || taskType === 'INTERNAL_AUDIT'

  const toggleMember = (id: string) =>
    setMemberIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])

  async function save() {
    if (!clientId)  { setError('Pick a client'); return }
    if (!title.trim()) { setError('Give the engagement a title'); return }
    if (!periodEnd) { setError('Set the period end date'); return }

    setSaving(true); setError('')
    try {
      const { data } = await api.post('/audit/engagements', {
        clientId, taskType, title: title.trim(),
        description: description.trim() || undefined,
        periodEndDate: periodEnd,
        periodLabel: periodLabel.trim() || undefined,
        dueDate: dueDate || undefined,
        materiality: materiality ? Number(materiality) : undefined,
        teamLeadId: teamLeadId || undefined,
        memberIds: isTeamJob ? memberIds : (teamLeadId ? [] : []),
      })
      const created = data?.data ?? data
      onSaved(created.id)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not create the engagement')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ background: P.bgMain, minHeight: '100vh', padding: '0 20px 20px' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', fontSize: 26, color: TEAL }}>Audit</h1>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
        <PanelHeader title="New Engagement" onBack={onClose} />

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Client <span style={{ color: '#ef4444' }}>*</span></label>
              <StyledSelect value={clientId} onChange={setClientId} placeholder="Select client…"
                options={clients.map((c: any) => ({ value: c.id, label: c.businessName ?? c.fullName ?? c.user?.fullName ?? '' }))} />
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
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
            <div>
              <label style={labelStyle}>Materiality</label>
              <input type="number" min={0} value={materiality} onChange={e => setMateriality(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Scope / Notes</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Anything the team should know before starting" style={inputStyle} />
          </div>

          {/* Team */}
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>
            TEAM
          </div>
          <div style={{ marginBottom: 14, maxWidth: 360 }}>
            <label style={labelStyle}>Team Lead</label>
            <StyledSelect value={teamLeadId} onChange={setTeamLeadId} placeholder="Select team lead…"
              options={staff.map((s: any) => ({ value: s.id, label: `${s.fullName} (${s.userCode})` }))} />
          </div>

          {isTeamJob ? (
            <>
              <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: F, marginBottom: 8 }}>
                Members the team lead can allocate heads to
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                {staff.filter((s: any) => s.id !== teamLeadId).map((s: any) => {
                  const on = memberIds.includes(s.id)
                  return (
                    <label key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                      padding: '5px 10px', borderRadius: 8, fontFamily: F, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${on ? TEAL : P.border}`, background: on ? '#E8EEF7' : '#fff',
                      color: on ? TEAL : NAVY,
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggleMember(s.id)}
                        style={{ accentColor: TEAL, cursor: 'pointer' }} />
                      {s.fullName}
                      <span style={{ color: '#94A3B8', fontWeight: 500 }}>{s.userCode}</span>
                    </label>
                  )
                })}
                {staff.length === 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>
                    Nobody is in the Audit department yet. Set a user&apos;s department to Audit in Settings first.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>
              {TASK_TYPES.find(t => t.value === taskType)?.label} is normally handled by one person, so no wider team is needed.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '14px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Engagement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
