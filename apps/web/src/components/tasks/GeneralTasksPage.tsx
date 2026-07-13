'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import StyledSelect from '@/components/ui/StyledSelect'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const GOLD = '#F2AC18'

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  LOW:    { label: 'Low',    color: '#3A6B3A', bg: '#EBF5EB' },
  MEDIUM: { label: 'Medium', color: '#D7A520', bg: '#FAEFD0' },
  HIGH:   { label: 'High',   color: '#D62828', bg: '#FDECEA' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  TODO:        { label: 'To Do',       color: '#5C5C5C', bg: '#F3F4F6', dot: '#9FA7B2' },
  IN_PROGRESS: { label: 'In Progress', color: '#1E8496', bg: '#E5F3F5', dot: TEAL       },
  DONE:        { label: 'Done',        color: '#3A6B3A', bg: '#EBF5EB', dot: '#3A6B3A'  },
}

const TAX_TYPE_LABELS: Record<string, string> = {
  sales_tax:  'Sales Tax',
  income_tax: 'Income Tax',
  wht:        'Withholding Tax',
  notices:    'Notices & Replies',
  general:    'General',
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: NAVY, bg: '#eee', dot: NAVY }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      color: m.color, background: m.bg, fontFamily: "'Aptos', sans-serif",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.dot }} />
      {m.label}
    </span>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.MEDIUM
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block', flexShrink: 0 }} title={m.label} />
}

function formatDate(d: string | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dueDate: string | null | undefined, status: string) {
  if (!dueDate || status === 'DONE') return false
  return new Date(dueDate) < new Date()
}

interface Props {
  taxType: string   // sales_tax | income_tax | wht | notices
}

export default function GeneralTasksPage({ taxType }: Props) {
  const { user } = useAuth()
  const role = user?.role ?? ''

  const [tasks,           setTasks]           = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [selected,        setSelected]        = useState<any>(null)
  const [listCollapsed,   setListCollapsed]   = useState(false)
  const [search,          setSearch]          = useState('')
  const [showCreate,      setShowCreate]      = useState(false)
  const [showEdit,        setShowEdit]        = useState(false)
  const [assignableUsers, setAssignableUsers] = useState<any[]>([])
  const [clients,         setClients]         = useState<any[]>([])
  const [saving,          setSaving]          = useState(false)
  const [toast,           setToast]           = useState<{ msg: string; ok: boolean } | null>(null)

  const emptyForm = { title: '', description: '', priority: 'MEDIUM', dueDate: '', assignedToId: '', clientId: '', taxType: '', authority: '' }
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/tasks', { params: { taxType } })
      const d = res.data?.data ?? res.data
      setTasks(Array.isArray(d) ? d : [])
    } catch { setTasks([]) }
    finally { setLoading(false) }
  }, [taxType])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  useEffect(() => {
    api.get('/tasks/assignable-users').then(r => {
      const raw = r.data?.data ?? r.data
      const list = Array.isArray(raw) ? raw : []
      const sorted = [
        ...list.filter((u: any) => u.id === user?.id),
        ...list.filter((u: any) => u.id !== user?.id),
      ]
      setAssignableUsers(sorted)
    }).catch(() => {})
    api.get('/tasks/clients').then(r => {
      const d = r.data?.data ?? r.data
      setClients(Array.isArray(d) ? d : [])
    }).catch(() => {})
  }, [user?.id])

  const openCreate = () => {
    setForm({ ...emptyForm })
    setShowCreate(true)
  }

  const openEdit = (task: any) => {
    setForm({
      title:       task.title,
      description: task.description ?? '',
      priority:    task.priority,
      dueDate:     task.dueDate ? task.dueDate.split('T')[0] : '',
      assignedToId: task.assignedTo?.id ?? '',
      clientId:    task.client?.id ?? '',
      taxType:     task.taxType ?? '',
      authority:   task.authority ?? '',
    })
    setShowEdit(true)
  }

  const uw = (r: any) => r?.data ?? r   // unwrap TransformInterceptor envelope

  const handleCreate = async () => {
    const effectiveAssignedToId = canAssignOthers ? form.assignedToId : user?.id
    const PIPELINE_TYPES = ['sales_tax', 'income_tax', 'wht']
    const isPipeline = PIPELINE_TYPES.includes(form.taxType ?? taxType ?? '')
    if ((!isPipeline && !form.title.trim()) || !form.clientId || !effectiveAssignedToId) return
    setSaving(true)
    try {
      const res = await api.post('/tasks', {
        title:        isPipeline ? undefined : form.title,
        description:  form.description || undefined,
        priority:     form.priority,
        dueDate:      form.dueDate || undefined,
        assignedToId: effectiveAssignedToId,
        clientId:     form.clientId,
        taxType,
        authority:    form.authority || undefined,
      })
      const task = uw(res.data)
      setTasks(prev => [task, ...prev])
      setShowCreate(false)
      showToast('Task created')
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Failed', false)
    } finally { setSaving(false) }
  }

  const handleEdit = async () => {
    if (!selected || !form.title.trim()) return
    setSaving(true)
    try {
      const res = await api.patch(`/tasks/${selected.id}`, {
        title:       form.title,
        description: form.description || undefined,
        priority:    form.priority,
        dueDate:     form.dueDate || undefined,
        assignedToId: form.assignedToId,
        clientId:    form.clientId || undefined,
      })
      const task = uw(res.data)
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      if (selected?.id === task.id) setSelected(task)
      setShowEdit(false)
      showToast('Task updated')
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Failed', false)
    } finally { setSaving(false) }
  }

  const handleStatusChange = async (task: any, status: string) => {
    try {
      const res = await api.patch(`/tasks/${task.id}`, { status })
      const updated = uw(res.data)
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      if (selected?.id === updated.id) setSelected(updated)
    } catch { showToast('Failed', false) }
  }

  const handleDelete = async (task: any) => {
    if (!confirm(`Delete "${task.title}"?`)) return
    try {
      await api.delete(`/tasks/${task.id}`)
      setTasks(prev => prev.filter(t => t.id !== task.id))
      if (selected?.id === task.id) { setSelected(null); setListCollapsed(false) }
      showToast('Deleted')
    } catch { showToast('Failed to delete', false) }
  }

  const canEdit   = (task: any) => role === 'ADMIN' || role === 'PARTNER' || task.createdBy?.id === user?.id
  const canDelete = (task: any) => role === 'ADMIN' || role === 'PARTNER' || task.createdBy?.id === user?.id
  const canCreate = true
  const canAssignOthers = role === 'ADMIN' || role === 'PARTNER' || role === 'MANAGER'

  const filtered = tasks.filter(t => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      t.title?.toLowerCase().includes(q) ||
      t.client?.businessName?.toLowerCase().includes(q) ||
      t.client?.user?.fullName?.toLowerCase().includes(q) ||
      t.assignedTo?.fullName?.toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? '#3A6B3A' : '#D62828', color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          fontFamily: "'Aptos', sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>{toast.msg}</div>
      )}

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div style={{
        width: listCollapsed ? 0 : 340, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: '#EDF0F3', borderRight: `1px solid ${P.border}`,
        overflow: 'hidden', transition: 'width .25s',
      }}>
        {/* Panel header */}
        <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${P.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontFamily: "'Aptos', sans-serif", fontSize: 18, fontWeight: 900, color: NAVY }}>
              {TAX_TYPE_LABELS[taxType] ?? 'Tasks'}
            </h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {canCreate && (
                <button onClick={openCreate} title="New Task" style={{
                  background: `linear-gradient(135deg, ${NAVY} 0%, ${TEAL} 100%)`,
                  border: 'none', cursor: 'pointer', color: '#fff',
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  fontFamily: "'Aptos', sans-serif", display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New
                </button>
              )}
              <button onClick={() => setListCollapsed(true)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6,
              }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width={13} height={13} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" style={{
              width: '100%', boxSizing: 'border-box', paddingLeft: 30, paddingRight: 10,
              paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1px solid ${P.border}`,
              fontSize: 12, fontFamily: "'Aptos', sans-serif", outline: 'none', background: '#fff', color: NAVY,
            }} />
          </div>
        </div>

        {/* Task rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>
              No tasks yet.{canCreate ? ' Click + New to create one.' : ''}
            </div>
          )}
          {filtered.map(t => {
            const isActive = selected?.id === t.id
            const sm = STATUS_META[t.status] ?? STATUS_META.TODO
            const overdue = isOverdue(t.dueDate, t.status)
            return (
              <button key={t.id} onClick={() => { setSelected(t); setListCollapsed(true) }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                border: 'none', cursor: 'pointer', borderBottom: `1px solid ${P.border}`,
                background: isActive ? '#E8EEF7' : 'transparent',
                borderLeft: isActive ? `3px solid ${TEAL}` : '3px solid transparent',
              }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f0f3f7' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <PriorityDot priority={t.priority} />
                  <span style={{
                    flex: 1, fontSize: 13, fontWeight: 700, color: NAVY,
                    fontFamily: "'Aptos', sans-serif",
                    textDecoration: t.status === 'DONE' ? 'line-through' : 'none',
                    opacity: t.status === 'DONE' ? 0.6 : 1,
                  }}>{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontSize: 11, color: P.textMuted, fontFamily: "'Aptos', sans-serif", paddingLeft: 14 }}>
                  {t.client?.businessName ?? t.client?.user?.fullName ?? t.assignedTo?.fullName}
                  {t.dueDate && (
                    <span style={{ color: overdue ? '#D62828' : P.textMuted, fontWeight: overdue ? 700 : 400 }}>
                      {' '}· {overdue ? '⚠ ' : ''}{formatDate(t.dueDate)}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f7f8fa', position: 'relative' }}>

        {/* Re-open list button */}
        {listCollapsed && (
          <button onClick={() => setListCollapsed(false)} style={{
            position: 'absolute', top: 12, left: 12, zIndex: 20,
            width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {!selected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 36, color: P.border }}>📋</p>
              <p style={{ fontSize: 13, color: P.textMuted, fontFamily: "'Aptos', sans-serif" }}>Select a task to view details</p>
              {canCreate && (
                <button onClick={openCreate} style={{
                  marginTop: 12, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${NAVY} 0%, ${TEAL} 100%)`,
                  color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'Aptos', sans-serif",
                }}>+ New Task</button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 24px', maxWidth: 680, margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: NAVY, fontFamily: "'Aptos', sans-serif" }}>
                  {selected.title}
                </h2>
                {selected.client && (
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: P.textMuted, fontFamily: "'Aptos', sans-serif" }}>
                    {selected.client.businessName ?? selected.client.user?.fullName} · {TAX_TYPE_LABELS[selected.taxType] ?? selected.taxType}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {canEdit(selected) && (
                  <button onClick={() => openEdit(selected)} style={{
                    padding: '6px 14px', borderRadius: 7, border: `1px solid ${P.border}`, background: '#fff',
                    color: NAVY, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif",
                  }}>Edit</button>
                )}
                {canDelete(selected) && (
                  <button onClick={() => handleDelete(selected)} style={{
                    padding: '6px 14px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff',
                    color: '#D62828', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Aptos', sans-serif",
                  }}>Delete</button>
                )}
                <button onClick={() => { setSelected(null); setListCollapsed(false) }} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer', color: P.textMuted, padding: 6,
                }}>
                  <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Status buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {Object.entries(STATUS_META).map(([key, m]) => (
                <button key={key} onClick={() => handleStatusChange(selected, key)} style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: "'Aptos', sans-serif", fontSize: 12, fontWeight: 700, transition: 'all .15s',
                  background: selected.status === key ? m.bg : '#F3F4F6',
                  color: selected.status === key ? m.color : '#5C5C5C',
                  boxShadow: selected.status === key ? `0 2px 8px ${m.dot}33` : 'none',
                  outline: selected.status === key ? `2px solid ${m.dot}` : 'none',
                  outlineOffset: 1,
                }}>{m.label}</button>
              ))}
            </div>

            {/* Info card */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, padding: '16px 20px', marginBottom: 14 }}>
              {[
                ['Status',      <StatusBadge key="s" status={selected.status} />],
                ['Priority',    <span key="p" style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_META[selected.priority]?.color ?? NAVY }}>{PRIORITY_META[selected.priority]?.label ?? selected.priority}</span>],
                ['Tax Type',    TAX_TYPE_LABELS[selected.taxType] ?? selected.taxType],
                ['Client',      selected.client ? (selected.client.businessName ?? selected.client.user?.fullName) : ''],
                ['Assigned To', selected.assignedTo?.fullName + (selected.assignedTo?.id === user?.id ? ' (You)' : '')],
                ['Created By',  selected.createdBy?.fullName],
                ['Due Date',    isOverdue(selected.dueDate, selected.status)
                  ? <span key="d" style={{ color: '#D62828', fontWeight: 700 }}>⚠ {formatDate(selected.dueDate)} Overdue</span>
                  : formatDate(selected.dueDate)],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', gap: 12, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${P.gridLine}` }}>
                  <span style={{ minWidth: 110, fontSize: 12, color: P.textMuted, fontWeight: 600, fontFamily: "'Aptos', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <span style={{ fontSize: 13, color: NAVY, fontFamily: "'Aptos', sans-serif" }}>{value ?? ''}</span>
                </div>
              ))}
            </div>

            {/* Description */}
            {selected.description && (
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, padding: '16px 20px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'Aptos', sans-serif" }}>Description</p>
                <p style={{ margin: 0, fontSize: 13, color: NAVY, fontFamily: "'Aptos', sans-serif", lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.description}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {(showCreate || showEdit) && (
        <TaskFormModal
          title={showCreate ? 'New Task' : 'Edit Task'}
          form={form}
          setForm={setForm}
          clients={clients}
          assignableUsers={assignableUsers}
          canAssignOthers={canAssignOthers}
          saving={saving}
          taxType={taxType}
          currentUserId={user?.id}
          onClose={() => { setShowCreate(false); setShowEdit(false) }}
          onSubmit={showCreate ? handleCreate : handleEdit}
          submitLabel={showCreate ? 'Create Task' : 'Save Changes'}
        />
      )}
    </div>
  )
}

// ── Searchable select (combobox) ──────────────────────────────────────────────
function SearchableSelect({ value, onChange, options, placeholder, loading, required, borderColor }: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  loading?: boolean
  required?: boolean
  borderColor?: string
}) {
  const [query,    setQuery]    = useState('')
  const [open,     setOpen]     = useState(false)
  const [focused,  setFocused]  = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)
  const displayVal = focused ? query : (selected?.label ?? '')

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setFocused(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (opt: { value: string; label: string }) => {
    onChange(opt.value)
    setQuery(''); setOpen(false); setFocused(false)
  }

  const handleFocus = () => { setFocused(true); setQuery(''); setOpen(true) }
  const handleBlur  = () => { /* handled by mousedown outside */ }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={displayVal}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={loading ? 'Loading…' : (placeholder ?? 'Search…')}
          readOnly={loading}
          style={{
            ...inputStyle,
            borderColor: borderColor ?? '#E0DDD5',
            paddingRight: 30,
            cursor: loading ? 'wait' : 'text',
          }}
        />
        {/* chevron */}
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#808080' }}>
          <svg width={13} height={13} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </span>
      </div>

      {open && !loading && (
        <div style={{
          position: 'absolute', zIndex: 999, top: 'calc(100% + 3px)', left: 0, right: 0,
          background: '#fff', border: '1.5px solid #E0DDD5', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#808080', fontFamily: "'Aptos',sans-serif" }}>No results found</div>
          ) : filtered.map(opt => (
            <div key={opt.value} onMouseDown={() => handleSelect(opt)}
              style={{
                padding: '9px 14px', fontSize: 13, fontFamily: "'Aptos',sans-serif", cursor: 'pointer',
                color: opt.value === value ? TEAL : NAVY,
                fontWeight: opt.value === value ? 700 : 400,
                background: opt.value === value ? '#E5F3F5' : 'transparent',
                borderBottom: '1px solid #F0EDE5',
              }}
              onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = '#f7f8fa' }}
              onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >{opt.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared form modal (also exported for Sidebar use) ─────────────────────────
export function TaskFormModal({
  title, form, setForm, clients, clientsLoading, assignableUsers, canAssignOthers,
  saving, taxType, currentUserId, onClose, onSubmit, submitLabel, showSalesTax,
}: {
  title: string
  form: any
  setForm: React.Dispatch<React.SetStateAction<any>>
  clients: any[]
  clientsLoading?: boolean
  assignableUsers: any[]
  canAssignOthers: boolean
  saving: boolean
  taxType?: string
  currentUserId?: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  showSalesTax?: boolean
}) {
  const PIPELINE_TAX_TYPES = ['sales_tax', 'income_tax', 'wht']
  const isSalesTax     = form.taxType === 'sales_tax'
  const isIncomeTax    = form.taxType === 'income_tax'
  const isWHT          = form.taxType === 'wht'
  const isPipelineTax  = PIPELINE_TAX_TYPES.includes(form.taxType)
  const isFbrNotices   = form.taxType === 'notices'
  const fbrOtherOk  = !isFbrNotices || (form.fbrTaxType ?? 'INCOME_TAX') !== 'OTHER' || !!form.fbrTaxTypeOther?.trim()
  const fbrYearOk   = !isFbrNotices || !form.fbrTaxYear || (form.fbrTaxYear.length === 4 && Number(form.fbrTaxYear) >= 2000 && Number(form.fbrTaxYear) <= 2099)
  const canSubmit   = !saving && (isPipelineTax || isFbrNotices || !!form.title.trim()) && !!form.clientId && (!canAssignOthers || isFbrNotices || !!form.assignedToId) && (!!taxType || !!form.taxType) && fbrOtherOk && fbrYearOk

  // Notice sections — loaded when FBR tab is active, re-loaded on taxType change
  const [noticeSections, setNoticeSections] = useState<{ value: string; label: string }[]>([{ value: '', label: 'None' }])
  const [loadingSections, setLoadingSections] = useState(false)
  useEffect(() => {
    if (!isFbrNotices) return
    setLoadingSections(true)
    const t = (form.fbrTaxType ?? 'INCOME_TAX') === 'OTHER' ? 'OTHER' : (form.fbrTaxType ?? 'INCOME_TAX')
    api.get(`/fbr/notice-sections?taxType=${t}`).then(r => {
      const list = r.data?.data ?? r.data ?? []
      setNoticeSections([{ value: '', label: 'None' }, ...(Array.isArray(list) ? list : []).map((s: any) => ({ value: s.section, label: s.section }))])
      setForm((f: any) => ({ ...f, fbrNoticeSection: '' }))
    }).catch(() => setNoticeSections([{ value: '', label: 'None' }]))
      .finally(() => setLoadingSections(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFbrNotices, form.fbrTaxType])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ background: '#7EC8D0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: NAVY, letterSpacing: '0.06em' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.35)', border: 'none', borderRadius: 7, cursor: 'pointer', color: NAVY, fontSize: 20, lineHeight: 1, fontWeight: 700, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: 1 }}>

          {/* Task Type (only shown when not locked to a specific tab) */}
          {!taxType && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Task Type <span style={{ color: '#D62828' }}>*</span></label>
              <SearchableSelect
                value={form.taxType ?? ''}
                onChange={val => setForm((f: any) => ({ ...f, taxType: val }))}
                options={[
                  ...(showSalesTax ? [{ value: 'sales_tax',  label: 'Sales Tax' }] : []),
                  { value: 'income_tax', label: 'Income Tax' },
                  { value: 'wht',        label: 'Withholding Tax' },
                  { value: 'notices',    label: 'Notices & Appeals' },
                  { value: 'general',    label: 'General Task' },
                ]}
                placeholder="Select task type…"
                borderColor={!form.taxType ? '#F5A623' : '#E0DDD5'}
              />
            </div>
          )}

          {/* Pipeline tax extra fields (Sales Tax / Income Tax / WHT) */}
          {!taxType && isPipelineTax && (
            <>
              {/* Authority — Sales Tax only */}
              {isSalesTax && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Tax Authority <span style={{ color: '#D62828' }}>*</span></label>
                  <SearchableSelect
                    value={form.authority ?? 'FBR'}
                    onChange={val => setForm((f: any) => ({ ...f, authority: val }))}
                    options={['FBR','PRA','SRB','KPRA','BRA','AJK'].map(a => ({ value: a, label: a }))}
                    placeholder="Select authority…"
                    borderColor="#E0DDD5"
                  />
                </div>
              )}
              {/* Return Type — all pipeline types */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Return Type <span style={{ color: '#D62828' }}>*</span></label>
                <SearchableSelect
                  value={form.returnType ?? 'ORIGINAL'}
                  onChange={val => setForm((f: any) => ({ ...f, returnType: val }))}
                  options={[{ value: 'ORIGINAL', label: 'Original Return' }, { value: 'REVISED', label: 'Revised Return' }]}
                  placeholder="Select return type…"
                  borderColor="#E0DDD5"
                />
              </div>
              {/* Period fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                {/* Month — Sales Tax only */}
                {isSalesTax && (
                  <div>
                    <label style={labelStyle}>Period Month <span style={{ color: '#D62828' }}>*</span></label>
                    <StyledSelect
                      value={String(form.periodMonth ?? new Date().getMonth() + 1)}
                      onChange={val => setForm((f: any) => ({ ...f, periodMonth: Number(val) }))}
                      options={['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => ({ value: String(i+1), label: m }))}
                    />
                  </div>
                )}
                {/* Quarter — WHT only */}
                {isWHT && (
                  <div>
                    <label style={labelStyle}>Quarter <span style={{ color: '#D62828' }}>*</span></label>
                    <StyledSelect
                      value={String(form.periodMonth ?? 1)}
                      onChange={val => setForm((f: any) => ({ ...f, periodMonth: Number(val) }))}
                      options={['Q1 (Jan–Mar)','Q2 (Apr–Jun)','Q3 (Jul–Sep)','Q4 (Oct–Dec)'].map((q, i) => ({ value: String(i+1), label: q }))}
                    />
                  </div>
                )}
                {/* Income Tax: no month/quarter selection */}
                <div>
                  <label style={labelStyle}>Period Year <span style={{ color: '#D62828' }}>*</span></label>
                  <StyledSelect
                    value={String(form.periodYear ?? new Date().getFullYear())}
                    onChange={val => setForm((f: any) => ({ ...f, periodYear: Number(val) }))}
                    options={[2024, 2025, 2026, 2027].map(y => ({ value: String(y), label: String(y) }))}
                  />
                </div>
              </div>
            </>
          )}

          {/* FBR Notices & Appeals extra fields */}
          {isFbrNotices && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Entry Point <span style={{ color: '#D62828' }}>*</span></label>
                <SearchableSelect
                  value={form.fbrEntryPoint ?? 'FRESH_NOTICE'}
                  onChange={val => setForm((f: any) => ({ ...f, fbrEntryPoint: val }))}
                  options={[
                    { value: 'FRESH_NOTICE',         label: 'Fresh Notice' },
                    { value: 'FURTHER_NOTICE_ONLY',  label: 'Further Notice Only' },
                    { value: 'DIRECT_APPEAL',         label: 'Direct Appeal' },
                    { value: 'HEARING_ONLY',          label: 'Hearing Only' },
                  ]}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Tax Type <span style={{ color: '#D62828' }}>*</span></label>
                  <StyledSelect
                    value={form.fbrTaxType ?? 'INCOME_TAX'}
                    onChange={val => setForm((f: any) => ({ ...f, fbrTaxType: val, fbrTaxTypeOther: val !== 'OTHER' ? '' : f.fbrTaxTypeOther }))}
                    options={[
                      { value: 'INCOME_TAX', label: 'Income Tax' },
                      { value: 'SALES_TAX',  label: 'Sales Tax' },
                      { value: 'WHT',        label: 'Withholding Tax' },
                      { value: 'OTHER',      label: 'Other' },
                    ]}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Tax Year</label>
                  <input
                    type="number"
                    value={form.fbrTaxYear ?? ''}
                    onChange={e => {
                      const v = e.target.value
                      if (v === '' || (v.length <= 4 && /^\d{0,4}$/.test(v))) {
                        setForm((f: any) => ({ ...f, fbrTaxYear: v }))
                      }
                    }}
                    onKeyDown={e => { if (['-','e','E','+','.'].includes(e.key)) e.preventDefault() }}
                    placeholder="e.g. 2025"
                    min={2000}
                    max={2099}
                    style={{ ...inputStyle, appearance: 'none' as const }}
                  />
                  {form.fbrTaxYear && (form.fbrTaxYear.length !== 4 || Number(form.fbrTaxYear) < 2000 || Number(form.fbrTaxYear) > 2099) && (
                    <span style={{ fontSize: 11, color: '#D62828', marginTop: 3, display: 'block', fontFamily: "'Aptos', sans-serif" }}>Enter a valid 4-digit year</span>
                  )}
                </div>
              </div>
              {(form.fbrTaxType ?? 'INCOME_TAX') === 'OTHER' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Please specify <span style={{ color: '#D62828' }}>*</span></label>
                  <input
                    value={form.fbrTaxTypeOther ?? ''}
                    onChange={e => setForm((f: any) => ({ ...f, fbrTaxTypeOther: e.target.value }))}
                    placeholder="Specify tax type…"
                    style={inputStyle}
                  />
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Notice Under Section</label>
                <StyledSelect
                  value={form.fbrNoticeSection ?? ''}
                  onChange={val => setForm((f: any) => ({ ...f, fbrNoticeSection: val }))}
                  placeholder="Select section…"
                  options={noticeSections}
                  loading={loadingSections}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Notice Number</label>
                <input value={form.fbrNoticeNumber ?? ''} onChange={e => setForm((f: any) => ({ ...f, fbrNoticeNumber: e.target.value }))}
                  placeholder="Notice / reference number" style={inputStyle} />
              </div>
            </>
          )}

          {/* Authority — General Task only */}
          {!isPipelineTax && !isFbrNotices && (!taxType || taxType === 'general') && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Authority</label>
              <SearchableSelect
                value={form.authority ?? ''}
                onChange={val => setForm((f: any) => ({ ...f, authority: val }))}
                options={[
                  { value: '',     label: 'None' },
                  { value: 'FBR',  label: 'FBR'  },
                  { value: 'PRA',  label: 'PRA'  },
                  { value: 'SRB',  label: 'SRB'  },
                  { value: 'KPRA', label: 'KPRA' },
                  { value: 'BRA',  label: 'BRA'  },
                  { value: 'AJK',  label: 'AJK'  },
                ]}
                placeholder="Select authority…"
              />
            </div>
          )}

          {/* Title — hidden for FBR notices and pipeline tax types (Sales Tax / Income Tax / WHT) */}
          {!isFbrNotices && !isPipelineTax && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Task Title <span style={{ color: '#D62828' }}>*</span></label>
              <input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))}
                placeholder="Describe the task…" autoFocus
                style={inputStyle} />
            </div>
          )}

          {/* Client — required */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Client <span style={{ color: '#D62828' }}>*</span></label>
            <SearchableSelect
              value={form.clientId}
              onChange={val => setForm((f: any) => ({ ...f, clientId: val }))}
              options={clients.map(c => ({ value: c.id, label: c.businessName || c.user?.fullName || '' }))}
              placeholder="Search client…"
              loading={clientsLoading}
              borderColor={!form.clientId ? '#F5A623' : '#E0DDD5'}
            />
          </div>

          {!isFbrNotices && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {/* Priority */}
              <div>
                <label style={labelStyle}>Priority</label>
                <StyledSelect
                  value={form.priority}
                  onChange={val => setForm((f: any) => ({ ...f, priority: val }))}
                  options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }]}
                />
              </div>
              {/* Deadline */}
              <div>
                <label style={labelStyle}>Deadline</label>
                <input type="date" value={form.dueDate} onChange={e => setForm((f: any) => ({ ...f, dueDate: e.target.value }))}
                  style={inputStyle} />
              </div>
            </div>
          )}

          {/* Assign to — hidden for FBR notices */}
          {canAssignOthers && !isFbrNotices && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Assign To <span style={{ color: '#D62828' }}>*</span></label>
              <SearchableSelect
                value={form.assignedToId}
                onChange={val => setForm((f: any) => ({ ...f, assignedToId: val }))}
                options={assignableUsers.map(u => ({
                  value: u.id,
                  label: u.id === currentUserId ? `${u.fullName} (Myself)` : u.fullName,
                }))}
                placeholder="Search team member…"
              />
            </div>
          )}

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Description / Notes</label>
            <textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Additional details…"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid #E0DDD5`, display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#FAFBFC', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1.5px solid ${GOLD}`, background: '#fff', color: NAVY, cursor: 'pointer', fontFamily: "'Aptos', sans-serif" }}>
            Cancel
          </button>
          <button onClick={onSubmit} disabled={!canSubmit} style={{
            padding: '9px 22px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
            cursor: canSubmit ? 'pointer' : 'default',
            background: GOLD,
            color: NAVY, fontFamily: "'Aptos', sans-serif",
            opacity: canSubmit ? 1 : 0.6,
          }}>
            {saving ? 'Saving…' : isFbrNotices ? 'Create Case' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#808080',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  fontFamily: "'Aptos', sans-serif", marginBottom: 5,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: "'Aptos', sans-serif",
  outline: 'none', color: '#132E57', background: '#fff',
}
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  paddingRight: 36,
  cursor: 'pointer',
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  backgroundSize: '14px',
}

