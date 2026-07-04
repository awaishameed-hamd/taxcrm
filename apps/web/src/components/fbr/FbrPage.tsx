'use client'

import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import FbrCaseDetail from './FbrCaseDetail'
import StyledSelect from '@/components/ui/StyledSelect'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  navy:      '#132E57',
  teal:      '#1E8496',
  bg:        '#E8EAED',
  panelBg:   '#FFFFFF',
  border:    '#E0DDD5',
  text:      '#1A1A1A',
  muted:     '#6B7280',
  active:    '#EDF0F7',
  danger:    '#DC2626',
  warn:      '#D97706',
  green:     '#16A34A',
  purple:    '#7C3AED',
}

const STAGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  NOTICE:       { bg: '#DBEAFE', text: '#1E40AF', label: 'Notice'       },
  APPEAL:       { bg: '#EDE9FE', text: '#5B21B6', label: 'Appeal'       },
  STAY:         { bg: '#FEF3C7', text: '#92400E', label: 'Stay'          },
  HIGHER_FORUM: { bg: '#FEE2E2', text: '#991B1B', label: 'Higher Forum' },
  CLOSED:       { bg: '#D1FAE5', text: '#065F46', label: 'Closed'       },
}

const ENTRY_LABELS: Record<string, string> = {
  FRESH_NOTICE:        'Fresh Notice',
  FURTHER_NOTICE_ONLY: 'Further Notice',
  DIRECT_APPEAL:       'Direct Appeal',
  HEARING_ONLY:        'Hearing Only',
}

const TAX_TYPES = ['ALL', 'SALES_TAX', 'INCOME_TAX', 'WHT']
const STAGES    = ['ALL', 'NOTICE', 'APPEAL', 'STAY', 'HIGHER_FORUM', 'CLOSED']

const F = "'Inter', 'Outfit', sans-serif"

interface Client {
  id: string
  businessName: string | null
  ntn: string | null
  user: { id: string; fullName: string; userCode: string }
}

interface FbrCase {
  id: string
  caseNumber: string
  entryPoint: string
  currentStage: string
  taxType: string
  taxYear: string | null
  noticeNumber: string | null
  closedAt: string | null
  createdAt: string
  client: { id: string; businessName: string | null; user: { fullName: string; userCode: string } }
  noticeRounds: { id: string; roundNumber: number; outcome: string }[]
  appeal: { id: string; outcome: string; appealType: string } | null
  stayApplications: { id: string; outcome: string }[]
}

// ── New Case Modal ────────────────────────────────────────────────────────────
function NewCaseModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: Client[]
  onClose: () => void
  onCreated: (c: any) => void
}) {
  const [form, setForm] = useState({
    clientId:     '',
    entryPoint:   'FRESH_NOTICE',
    taxType:      'SALES_TAX',
    taxYear:      '',
    noticeNumber: '',
    description:  '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit() {
    if (!form.clientId)   { setErr('Select a client'); return }
    if (!form.entryPoint) { setErr('Select entry point'); return }
    setSaving(true)
    setErr('')
    try {
      const r = await api.post('/fbr/cases', form)
      onCreated(r.data)
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Failed to create case')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
    fontFamily: F, fontSize: 13, background: '#FAFAFA', color: C.text, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4, display: 'block',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 500, maxWidth: '95vw', fontFamily: F }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.navy, marginBottom: 20 }}>New FBR Case</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginBottom: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Client</label>
            <StyledSelect
              value={form.clientId}
              onChange={val => set('clientId', val)}
              placeholder="Select client..."
              options={[{ value: '', label: 'Select client...' }, ...clients.map((c: any) => ({ value: c.id, label: `${c.businessName || c.user.fullName} (${c.user.userCode})` }))]}
            />
          </div>

          <div>
            <label style={labelStyle}>Entry Point</label>
            <StyledSelect
              value={form.entryPoint}
              onChange={val => set('entryPoint', val)}
              options={[
                { value: 'FRESH_NOTICE', label: 'Fresh Notice' },
                { value: 'FURTHER_NOTICE_ONLY', label: 'Further Notice Only' },
                { value: 'DIRECT_APPEAL', label: 'Direct Appeal' },
                { value: 'HEARING_ONLY', label: 'Hearing Only' },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Tax Type</label>
            <StyledSelect
              value={form.taxType}
              onChange={val => set('taxType', val)}
              options={[
                { value: 'SALES_TAX', label: 'Sales Tax' },
                { value: 'INCOME_TAX', label: 'Income Tax' },
                { value: 'WHT', label: 'WHT' },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Tax Year</label>
            <input style={inputStyle} placeholder="e.g. 2025-26" value={form.taxYear} onChange={e => set('taxYear', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Notice Number</label>
            <input style={inputStyle} placeholder="FBR notice reference" value={form.noticeNumber} onChange={e => set('noticeNumber', e.target.value)} />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              placeholder="Brief description..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>
        </div>

        {err && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontFamily: F, fontSize: 13, cursor: 'pointer', color: C.muted }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: C.navy, color: '#fff', fontFamily: F, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}
          >
            {saving ? 'Creating...' : 'Create Case'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Case Row ──────────────────────────────────────────────────────────────────
function CaseRow({ c, selected, onClick }: { c: FbrCase; selected: boolean; onClick: () => void }) {
  const stage = STAGE_COLORS[c.currentStage] ?? { bg: '#F3F4F6', text: '#374151', label: c.currentStage }
  const activeRound = c.noticeRounds.find(r => r.outcome === 'PENDING')

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: selected ? '#EDF0F7' : '#fff',
        cursor: 'pointer',
        borderLeft: selected ? `3px solid ${C.navy}` : '3px solid transparent',
        transition: 'background .1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: C.navy, letterSpacing: '.05em' }}>{c.caseNumber}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: stage.bg, color: stage.text }}>{stage.label}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2, fontFamily: F }}>
        {c.client.businessName || c.client.user.fullName}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: F }}>{ENTRY_LABELS[c.entryPoint]}</span>
        <span style={{ fontSize: 10, color: C.muted }}>·</span>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: F }}>{c.taxType.replace('_', ' ')}</span>
        {c.taxYear && <><span style={{ fontSize: 10, color: C.muted }}>·</span><span style={{ fontSize: 10, color: C.muted, fontFamily: F }}>{c.taxYear}</span></>}
        {activeRound && (
          <span style={{ fontSize: 10, fontWeight: 700, color: C.teal, marginLeft: 'auto' }}>Round {activeRound.roundNumber}</span>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FbrPage() {
  const [clients,       setClients]       = useState<Client[]>([])
  const [cases,         setCases]         = useState<FbrCase[]>([])
  const [selectedCase,  setSelectedCase]  = useState<string | null>(null)
  const [caseDetail,    setCaseDetail]    = useState<any | null>(null)
  const [loadingCases,  setLoadingCases]  = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showNewCase,   setShowNewCase]   = useState(false)
  const [clientSearch,  setClientSearch]  = useState('')
  const [filterStage,   setFilterStage]   = useState('ALL')
  const [filterTax,     setFilterTax]     = useState('ALL')
  const [filterClient,  setFilterClient]  = useState<string | null>(null)

  // Load clients
  useEffect(() => {
    api.get('/fbr/clients').then(r => {
      const d = r.data?.data ?? r.data ?? []
      setClients(Array.isArray(d) ? d : [])
    }).catch(() => {})
  }, [])

  // Load cases
  const loadCases = () => {
    setLoadingCases(true)
    const params: any = {}
    if (filterClient) params.clientId = filterClient
    if (filterStage !== 'ALL') params.stage = filterStage
    if (filterTax   !== 'ALL') params.taxType = filterTax
    api.get('/fbr/cases', { params }).then(r => {
      const d = r.data?.data ?? r.data ?? []
      setCases(Array.isArray(d) ? d : [])
    }).catch(() => {}).finally(() => setLoadingCases(false))
  }

  useEffect(() => { loadCases() }, [filterClient, filterStage, filterTax])

  // Load case detail
  useEffect(() => {
    if (!selectedCase) { setCaseDetail(null); return }
    setLoadingDetail(true)
    api.get(`/fbr/cases/${selectedCase}`).then(r => {
      setCaseDetail(r.data?.data ?? r.data ?? null)
    }).catch(() => {}).finally(() => setLoadingDetail(false))
  }, [selectedCase])

  const filteredClients = clients.filter(c => {
    const name = (c.businessName || c.user.fullName).toLowerCase()
    return name.includes(clientSearch.toLowerCase())
  })

  function handleCaseCreated(c: any) {
    setShowNewCase(false)
    loadCases()
    setSelectedCase(c.id)
  }

  function handleCaseUpdated(updated: any) {
    setCaseDetail(updated)
    setCases(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
  }

  const panelHead: React.CSSProperties = {
    padding: '12px 16px',
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 15,
    color: C.navy,
    letterSpacing: '.08em',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#F8F9FB',
  }

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: F, background: C.bg, overflow: 'hidden' }}>
      {showNewCase && (
        <NewCaseModal
          clients={clients}
          onClose={() => setShowNewCase(false)}
          onCreated={handleCaseCreated}
        />
      )}

      {/* ── Left Panel: Clients ─────────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={panelHead}>
          <span>Notices & Appeals</span>
        </div>

        {/* Client search */}
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
          <input
            style={{ width: '100%', padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: F, outline: 'none', background: '#FAFAFA' }}
            placeholder="Search clients..."
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* All clients option */}
          <div
            onClick={() => setFilterClient(null)}
            style={{
              padding: '9px 14px',
              cursor: 'pointer',
              background: !filterClient ? C.active : 'transparent',
              borderLeft: !filterClient ? `3px solid ${C.navy}` : '3px solid transparent',
              fontSize: 12,
              fontWeight: !filterClient ? 700 : 500,
              color: !filterClient ? C.navy : C.text,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            All Clients
          </div>
          {filteredClients.map(c => (
            <div
              key={c.id}
              onClick={() => setFilterClient(c.id)}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                background: filterClient === c.id ? C.active : 'transparent',
                borderLeft: filterClient === c.id ? `3px solid ${C.navy}` : '3px solid transparent',
                fontSize: 12,
                fontWeight: filterClient === c.id ? 700 : 500,
                color: filterClient === c.id ? C.navy : C.text,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.businessName || c.user.fullName}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>{c.user.userCode}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Middle Panel: Cases List ──────────────────────────────────────────── */}
      <div style={{ width: 320, flexShrink: 0, background: '#fff', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={panelHead}>
          <span>Cases</span>
          <button
            onClick={() => setShowNewCase(true)}
            style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: C.navy, color: '#fff', fontFamily: F, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            + New
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '8px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1 }}>
            <StyledSelect
              value={filterStage}
              onChange={val => setFilterStage(val)}
              options={STAGES.map((s: string) => ({ value: s, label: s === 'ALL' ? 'All Stages' : (STAGE_COLORS[s]?.label ?? s) }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <StyledSelect
              value={filterTax}
              onChange={val => setFilterTax(val)}
              options={TAX_TYPES.map((t: string) => ({ value: t, label: t === 'ALL' ? 'All Tax Types' : t.replace('_', ' ') }))}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingCases ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 12 }}>Loading...</div>
          ) : cases.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 12 }}>
              No cases found.<br />
              <span style={{ color: C.teal, cursor: 'pointer' }} onClick={() => setShowNewCase(true)}>Create the first case →</span>
            </div>
          ) : (
            cases.map(c => (
              <CaseRow
                key={c.id}
                c={c}
                selected={selectedCase === c.id}
                onClick={() => setSelectedCase(c.id)}
              />
            ))
          )}
        </div>

        <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted, background: '#FAFAFA' }}>
          {cases.length} case{cases.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Right Panel: Case Detail ──────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
        {!selectedCase ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div style={{ color: C.muted, fontSize: 13, fontFamily: F }}>Select a case to view details</div>
          </div>
        ) : loadingDetail ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.muted, fontSize: 13, fontFamily: F }}>Loading case...</div>
        ) : caseDetail ? (
          <FbrCaseDetail
            case={caseDetail}
            onUpdated={handleCaseUpdated}
            onReload={() => {
              api.get(`/fbr/cases/${selectedCase}`).then(r => {
                const d = r.data?.data ?? r.data
                if (d) { setCaseDetail(d); handleCaseUpdated(d) }
              })
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
