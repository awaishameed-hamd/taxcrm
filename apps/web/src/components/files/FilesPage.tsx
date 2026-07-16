'use client'

import { useState, useEffect, useCallback } from 'react'
import api, { FILE_BASE_URL } from '@/lib/api'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const P = { border: '#E2E8F0', textMuted: '#94A3B8', iconMuted: '#94A3B8', bg: '#F8FAFC' }
const F = "'Aptos', sans-serif"

const TAX_TABS = [
  { key: 'SALES_TAX',  label: 'Sales Tax',        color: TEAL      },
  { key: 'INCOME_TAX', label: 'Income Tax',        color: '#C25A1F' },
  { key: 'WHT',        label: 'Withholding Tax',   color: '#7B2D8E' },
  { key: 'NOTICES',    label: 'Notices & Replies', color: '#1565C0' },
]

const STATUS_LABELS: Record<string, string> = {
  DATA_COLLECTION: 'Data Collection',
  IN_REVIEW:       'In Review',
  COMPLETED:       'Completed',
}

type ViewMode = 'grid' | 'list'
type IconSize = 'normal' | 'small'

const ICON_SIZES = {
  normal: { card: 150, folder: 44, fontSize: 13 },
  small:  { card: 110, folder: 32, fontSize: 11 },
}

function fileTypeFromUrl(url: string): 'pdf' | 'excel' | 'word' | 'image' | 'other' {
  const ext = url.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf')                                        return 'pdf'
  if (['xlsx', 'xls', 'csv'].includes(ext))                return 'excel'
  if (['docx', 'doc'].includes(ext))                       return 'word'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  return 'other'
}

function openFile(url: string, type: string) {
  const full = url.startsWith('http') ? url : `${FILE_BASE_URL}${url}`
  if (type === 'pdf' || type === 'image') { window.open(full, '_blank') }
  else { const a = document.createElement('a'); a.href = full; a.download = full.split('/').pop() ?? 'file'; a.click() }
}

function StatusBadge({ status }: { status: string }) {
  const bg = status === 'COMPLETED' ? '#DCFCE7' : status === 'DATA_COLLECTION' ? '#FEF3C7' : '#F1F5F9'
  const color = status === 'COMPLETED' ? '#166534' : status === 'DATA_COLLECTION' ? '#92400E' : '#475569'
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color }}>{STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}</span>
}

function FolderIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={`${color}22`} stroke={color} strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25m19.5 0v.75c0 1.242-1.008 2.25-2.25 2.25H4.5A2.25 2.25 0 012.25 18.75v-.75" />
    </svg>
  )
}

function FileTypeIcon({ type, size = 28 }: { type: string; size?: number }) {
  const s = size
  if (type === 'pdf')   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
  if (type === 'excel') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h1.5m-1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h17.25" /></svg>
  if (type === 'word')  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
  if (type === 'image') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#7B2D8E" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
}

interface Client { id: string; businessName: string | null; user: { id: string; userCode: string; fullName: string; isActive: boolean }; trainee: { id: string; fullName: string } | null }
interface FileItem { id: string; name: string; url: string; fileType: string; source: string }
interface Folder { taskId: string; period: string; periodMonth: number; periodYear: number; authority: string; returnType: string; status: string; fileCount: number; files: FileItem[] }

// Grouped month folder: one per period (e.g., "Jun 2026"), contains authority sub-folders
interface MonthGroup { period: string; periodMonth: number; periodYear: number; subFolders: Folder[]; totalFiles: number; allCompleted: boolean }

function groupByMonth(folders: Folder[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>()
  for (const f of folders) {
    const key = f.period
    if (!map.has(key)) map.set(key, { period: f.period, periodMonth: f.periodMonth, periodYear: f.periodYear, subFolders: [], totalFiles: 0, allCompleted: true })
    const g = map.get(key)!
    g.subFolders.push(f)
    g.totalFiles += f.fileCount
    if (f.status !== 'COMPLETED') g.allCompleted = false
  }
  return Array.from(map.values())
}

// ── Toolbar: view toggle + settings gear dropdown ──────────────────────────
function Toolbar({ view, setView, iconSize, setIconSize }: {
  view: ViewMode; setView: (v: ViewMode) => void
  iconSize: IconSize; setIconSize: (s: IconSize) => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const btnBase: React.CSSProperties = { background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 8px', transition: 'all 0.15s' }
  const active: React.CSSProperties  = { background: NAVY, color: '#fff' }
  const inactive: React.CSSProperties = { color: '#64748B' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 3, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
        <button title="Grid view" onClick={() => setView('grid')} style={{ ...btnBase, ...(view === 'grid' ? active : inactive) }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x={3} y={3} width={7} height={7} rx={1}/><rect x={14} y={3} width={7} height={7} rx={1}/><rect x={3} y={14} width={7} height={7} rx={1}/><rect x={14} y={14} width={7} height={7} rx={1}/>
          </svg>
        </button>
        <button title="List view" onClick={() => setView('list')} style={{ ...btnBase, ...(view === 'list' ? active : inactive) }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1={8} y1={6} x2={21} y2={6}/><line x1={8} y1={12} x2={21} y2={12}/><line x1={8} y1={18} x2={21} y2={18}/><circle cx={3} cy={6} r={1.5} fill="currentColor"/><circle cx={3} cy={12} r={1.5} fill="currentColor"/><circle cx={3} cy={18} r={1.5} fill="currentColor"/>
          </svg>
        </button>
      </div>

      {/* Settings gear — right side */}
      <div style={{ marginLeft: 'auto', position: 'relative' }}>
        <button
          title="Settings"
          onClick={() => setSettingsOpen(o => !o)}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${settingsOpen ? TEAL : P.border}`, background: settingsOpen ? '#EDF7F8' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: settingsOpen ? TEAL : '#64748B', transition: 'all 0.15s' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {settingsOpen && (
          <div style={{ position: 'absolute', top: 38, right: 0, zIndex: 100, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px 14px', minWidth: 160 }}>
            {/* Arrow */}
            <div style={{ position: 'absolute', top: -6, right: 10, width: 12, height: 12, background: '#fff', border: `1px solid ${P.border}`, borderBottom: 'none', borderRight: 'none', transform: 'rotate(45deg)' }} />

            <div style={{ fontSize: 10, fontWeight: 700, color: P.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: F }}>Icon Size</div>
            {(['normal', 'small'] as IconSize[]).map(s => (
              <button key={s} onClick={() => { setIconSize(s); setSettingsOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: iconSize === s ? '#EDF7F8' : 'transparent', marginBottom: 2, transition: 'background 0.12s' }}
                onMouseEnter={e => { if (iconSize !== s) e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={e => { if (iconSize !== s) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${iconSize === s ? TEAL : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {iconSize === s && <div style={{ width: 6, height: 6, borderRadius: '50%', background: TEAL }} />}
                </div>
                <span style={{ fontSize: 12, fontWeight: iconSize === s ? 700 : 500, color: iconSize === s ? TEAL : NAVY, fontFamily: F, textTransform: 'capitalize' }}>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FilesPage() {
  const [clients,       setClients]       = useState<Client[]>([])
  const [cLoading,      setCLoading]      = useState(true)
  const [search,        setSearch]        = useState('')
  const [selected,      setSelected]      = useState<Client | null>(null)
  const [activeTax,     setActiveTax]     = useState('SALES_TAX')
  const [folders,       setFolders]       = useState<Folder[]>([])
  const [fLoading,      setFLoading]      = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)

  // Navigation: null = month grid, MonthGroup = authority grid, Folder = files
  const [openMonth,  setOpenMonth]  = useState<MonthGroup | null>(null)
  const [openFolder, setOpenFolder] = useState<Folder | null>(null)

  // View preferences
  const [viewMode,  setViewMode]  = useState<ViewMode>('grid')
  const [iconSize,  setIconSize]  = useState<IconSize>('normal')

  useEffect(() => {
    setCLoading(true)
    api.get('/clients')
      .then(r => { const d = r.data?.data ?? r.data ?? []; setClients(Array.isArray(d) ? d : []) })
      .catch(() => {})
      .finally(() => setCLoading(false))
  }, [])

  const loadFolders = useCallback(async (silent = false) => {
    if (!selected) return
    if (!silent) { setFLoading(true); setOpenMonth(null); setOpenFolder(null) }
    try {
      const r = await api.get('/files', { params: { clientId: selected.id, taxType: activeTax } })
      const d = r.data?.data ?? r.data ?? []
      setFolders(Array.isArray(d) ? d : [])
    } catch { if (!silent) setFolders([]) }
    finally { if (!silent) setFLoading(false) }
  }, [selected, activeTax])

  useEffect(() => { loadFolders() }, [loadFolders])
  useAutoRefresh(() => loadFolders(true))

  const displayName = (c: Client) => c.businessName || c.user?.fullName || c.user?.userCode || 'Client'

  const filtered = clients.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.businessName?.toLowerCase().includes(q) || c.user?.fullName?.toLowerCase().includes(q) || c.user?.userCode?.toLowerCase().includes(q)
  })

  const activeTabCfg = TAX_TABS.find(t => t.key === activeTax)!
  const monthGroups  = groupByMonth(folders)
  const sz           = ICON_SIZES[iconSize]

  const PillsRow = (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 24px 8px', background: '#f7f8fa' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
          {TAX_TABS.map(tab => {
            const active = activeTax === tab.key
            return (
              <button key={tab.key} onClick={() => { setActiveTax(tab.key); setOpenMonth(null); setOpenFolder(null) }}
                style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: active ? 700 : 500, transition: 'all .15s', border: 'none', background: active ? tab.color : 'transparent', color: active ? '#fff' : '#5C5C5C', whiteSpace: 'nowrap' }}>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3 }}>
        {TAX_TABS.map(tab => (
          <div key={tab.key} style={{ flex: 1, background: tab.color, borderRadius: 2, opacity: activeTax === tab.key ? 1 : 0.35, transition: 'opacity .2s' }} />
        ))}
      </div>
    </div>
  )

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const Breadcrumb = () => {
    if (!selected) return null
    const crumbs: { label: string; onClick?: () => void }[] = [
      { label: displayName(selected), onClick: openMonth ? () => { setOpenMonth(null); setOpenFolder(null) } : undefined },
    ]
    if (openMonth)  crumbs.push({ label: openMonth.period, onClick: openFolder ? () => setOpenFolder(null) : undefined })
    if (openFolder) crumbs.push({ label: openFolder.authority + (openFolder.returnType === 'REVISED' ? ' (Revised)' : '') })

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={P.textMuted} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
            <span onClick={c.onClick} style={{ fontSize: i === 0 ? 15 : 12, fontWeight: c.onClick ? 600 : 700, color: c.onClick ? TEAL : NAVY, cursor: c.onClick ? 'pointer' : 'default', textDecoration: 'none', fontFamily: i === 0 ? "'Ethnocentric Rg', sans-serif" : F, letterSpacing: i === 0 ? '0.03em' : undefined } as React.CSSProperties}
              onMouseEnter={e => { if (c.onClick) e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}>
              {c.label}
            </span>
          </span>
        ))}
      </div>
    )
  }

  // ── Grid card ───────────────────────────────────────────────────────────────
  const GridCard = ({ icon, title, sub, badge, meta, onClick }: { icon: React.ReactNode; title: string; sub?: string; badge?: React.ReactNode; meta?: string; onClick: () => void }) => (
    <button onClick={onClick}
      style={{ background: '#fff', border: `1.5px solid ${P.border}`, borderRadius: 14, padding: `${sz.card === 150 ? 18 : 14}px ${sz.card === 150 ? 14 : 10}px`, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, transition: 'box-shadow 0.15s, border-color 0.15s', width: '100%' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.borderColor = activeTabCfg.color }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = P.border }}>
      {icon}
      <div style={{ fontSize: sz.fontSize, fontWeight: 700, color: NAVY, lineHeight: 1.3, wordBreak: 'break-word' }}>{title}</div>
      {sub && <div style={{ fontSize: 10, color: activeTabCfg.color, fontWeight: 600 }}>{sub}</div>}
      {badge}
      {meta && <div style={{ fontSize: 10, color: P.textMuted }}>{meta}</div>}
    </button>
  )

  // ── List row ─────────────────────────────────────────────────────────────────
  const ListRow = ({ icon, title, sub, badge, meta, onClick }: { icon: React.ReactNode; title: string; sub?: string; badge?: React.ReactNode; meta?: string; onClick: () => void }) => (
    <button onClick={onClick}
      style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, transition: 'box-shadow 0.12s, border-color 0.12s', width: '100%', marginBottom: 6 }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.07)'; e.currentTarget.style.borderColor = activeTabCfg.color }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = P.border }}>
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: activeTabCfg.color, fontWeight: 600, marginTop: 1 }}>{sub}</div>}
      </div>
      {badge}
      {meta && <div style={{ fontSize: 11, color: P.textMuted, flexShrink: 0 }}>{meta}</div>}
      <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.textMuted} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
    </button>
  )

  // ── Render items (grid or list) ──────────────────────────────────────────────
  const renderMonthGroups = () => {
    const gridStyle: React.CSSProperties = viewMode === 'grid'
      ? { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${sz.card}px, 1fr))`, gap: 14 }
      : { display: 'flex', flexDirection: 'column' }

    return (
      <div style={gridStyle}>
        {monthGroups.map(g => {
          const subCount = g.subFolders.length
          const meta = `${subCount} ${subCount === 1 ? 'sub-folder' : 'sub-folders'} · ${g.totalFiles} ${g.totalFiles === 1 ? 'file' : 'files'}`
          const icon = <FolderIcon color={activeTabCfg.color} size={viewMode === 'grid' ? sz.folder : 28} />
          const badge = g.allCompleted ? <StatusBadge status="COMPLETED" /> : <StatusBadge status="DATA_COLLECTION" />
          return viewMode === 'grid'
            ? <GridCard key={g.period} icon={icon} title={g.period} badge={badge} meta={meta} onClick={() => setOpenMonth(g)} />
            : <ListRow  key={g.period} icon={icon} title={g.period} badge={badge} meta={meta} onClick={() => setOpenMonth(g)} />
        })}
      </div>
    )
  }

  const renderSubFolders = (g: MonthGroup) => {
    const gridStyle: React.CSSProperties = viewMode === 'grid'
      ? { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${sz.card}px, 1fr))`, gap: 14 }
      : { display: 'flex', flexDirection: 'column' }

    return (
      <div style={gridStyle}>
        {g.subFolders.map(f => {
          const sub = f.returnType === 'REVISED' ? `${f.authority} · Revised` : f.authority
          const meta = `${f.fileCount} ${f.fileCount === 1 ? 'file' : 'files'}`
          const icon = <FolderIcon color={activeTabCfg.color} size={viewMode === 'grid' ? sz.folder : 28} />
          const badge = <StatusBadge status={f.status} />
          return viewMode === 'grid'
            ? <GridCard key={f.taskId} icon={icon} title={sub} badge={badge} meta={meta} onClick={() => setOpenFolder(f)} />
            : <ListRow  key={f.taskId} icon={icon} title={sub} badge={badge} meta={meta} onClick={() => setOpenFolder(f)} />
        })}
      </div>
    )
  }

  const renderFiles = (folder: Folder) => {
    if (folder.files.length === 0) return (
      <div style={{ textAlign: 'center', paddingTop: 40, color: P.textMuted, fontSize: 13 }}>No files attached to this task yet.</div>
    )
    const gridStyle: React.CSSProperties = viewMode === 'grid'
      ? { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${sz.card}px, 1fr))`, gap: 12 }
      : { display: 'flex', flexDirection: 'column' }

    return (
      <div style={gridStyle}>
        {folder.files.map(file => {
          const ft = fileTypeFromUrl(file.url)
          const icon = <FileTypeIcon type={ft} size={viewMode === 'grid' ? sz.folder : 24} />
          return viewMode === 'grid'
            ? (
              <button key={file.id} onClick={() => openFile(file.url, ft)} title={file.name}
                style={{ background: '#fff', border: `1.5px solid ${P.border}`, borderRadius: 12, padding: `${sz.card === 150 ? 14 : 10}px 12px`, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, transition: 'box-shadow 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.10)'; e.currentTarget.style.borderColor = activeTabCfg.color }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = P.border }}>
                {icon}
                <div style={{ fontSize: sz.fontSize - 2, fontWeight: 600, color: NAVY, lineHeight: 1.3, wordBreak: 'break-all', maxWidth: '100%' }}>{file.name.length > 24 ? file.name.slice(0, 21) + '…' : file.name}</div>
                <div style={{ fontSize: 10, color: P.textMuted, background: P.bg, borderRadius: 6, padding: '2px 7px' }}>{file.source.replace(/_/g, ' ')}</div>
              </button>
            )
            : (
              <button key={file.id} onClick={() => openFile(file.url, ft)}
                style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, transition: 'box-shadow 0.12s', width: '100%', marginBottom: 6 }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.07)'; e.currentTarget.style.borderColor = activeTabCfg.color }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = P.border }}>
                {icon}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>{file.source.replace(/_/g, ' ')}</div>
                </div>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.textMuted} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
              </button>
            )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{ width: listCollapsed ? 0 : 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#EDF0F3', borderRight: `1px solid ${P.border}`, overflow: 'hidden', transition: 'width .25s' }}>
        <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, borderBottom: `1px solid ${P.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: '0 14px' }}>
              <h2 style={{ margin: 0, fontFamily: "'Angelos', sans-serif", fontSize: 20, display: 'inline-block', transform: 'skewX(12deg)', color: NAVY }}>Files</h2>
              <button onClick={() => setListCollapsed(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6 }}
                onMouseEnter={e => { e.currentTarget.style.color = NAVY }} onMouseLeave={e => { e.currentTarget.style.color = P.iconMuted }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: '7px 10px' }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2} style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…" style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, fontFamily: F, background: 'transparent', color: NAVY }} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {cLoading && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>Loading…</div>}
            {!cLoading && filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>{search ? `No clients matching "${search}".` : 'No clients found.'}</div>}
            {!cLoading && filtered.map((c, idx) => {
              const isActive = selected?.id === c.id
              return (
                <button key={c.id} onClick={() => { setSelected(c); setOpenMonth(null); setOpenFolder(null) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: `1px solid ${isActive ? TEAL : P.border}`, borderRadius: 8, cursor: 'pointer', marginBottom: 6, background: isActive ? '#E8EEF7' : '#F8FAFC', fontFamily: "'Aptos',sans-serif" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#EEF2F7' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, background: TEAL, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? TEAL : NAVY, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(c)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f7f8fa', overflow: 'hidden' }}>
        {PillsRow}

        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {listCollapsed && (
            <button onClick={() => setListCollapsed(false)}
              style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}

          {!selected && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: P.textMuted }}>
              <svg width={32} height={32} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25m19.5 0v.75c0 1.242-1.008 2.25-2.25 2.25H4.5A2.25 2.25 0 012.25 18.75v-.75" /></svg>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Select a client to view their files</span>
            </div>
          )}

          {selected && (
            <div style={{ padding: 24 }}>
              <Breadcrumb />
              <Toolbar view={viewMode} setView={setViewMode} iconSize={iconSize} setIconSize={setIconSize} />

              {fLoading && <div style={{ textAlign: 'center', paddingTop: 60, color: P.textMuted, fontSize: 13 }}>Loading folders…</div>}

              {!fLoading && !openMonth && !openFolder && (
                monthGroups.length === 0
                  ? <div style={{ textAlign: 'center', paddingTop: 60, color: P.textMuted, fontSize: 13 }}>No {activeTabCfg.label} folders found for this client.</div>
                  : renderMonthGroups()
              )}

              {!fLoading && openMonth && !openFolder && renderSubFolders(openMonth)}

              {!fLoading && openFolder && renderFiles(openFolder)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

