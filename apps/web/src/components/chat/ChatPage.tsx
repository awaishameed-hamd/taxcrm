'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import api, { FILE_BASE_URL } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { usePhone } from '@/hooks/useMediaQuery'

// ── WhatsApp-authentic palette + font, scoped to this page only ─────────────
const WA = {
  panelBg:        '#FFFFFF',
  chatBg:         '#EFEAE2',
  headerBg:       '#F0F2F5',
  green:          '#008069',
  sentBubble:     '#D9FDD3',
  receivedBubble: '#FFFFFF',
  textPrimary:    '#111B21',
  textSecondary:  '#667781',
  border:         '#E9EDEF',
  hoverBg:        '#F5F6F6',
  activeBg:       '#F0F2F5',
  online:         '#25D366',
  danger:         '#DC2626',
  dangerBg:       '#FEE2E2',
}
const WA_FONT = "'Aptos', sans-serif"

const QUICK_EMOJIS = ['😀','😂','😍','😊','👍','🙏','❤️','😢','😮','😡','🎉','🔥','✅','👏','🤝','📌']

// Keeps a right-click menu fully on screen, regardless of where the click landed
function clampMenuPosition(x: number, y: number, estWidth: number, estHeight: number) {
  const margin = 8
  return {
    x: Math.max(margin, Math.min(x, window.innerWidth  - estWidth  - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - estHeight - margin)),
  }
}

interface Contact {
  id:         string
  fullName:   string
  role:       string
  avatar:     string | null
  isOnline?:  boolean
  lastSeenAt?: string | null
}

interface Conversation {
  id:            string
  isGroup?:      boolean
  name?:         string | null
  memberCount?:  number
  otherUser:     Contact | null
  messages:      { content: string; createdAt: string; type: string; sender: { id: string; fullName: string } }[]
  participants:  { userId: string; lastReadAt: string | null }[]
  lastMessageAt: string | null
  unreadCount?:  number
}

interface GroupMember extends Contact { isAdmin: boolean }
interface GroupInfo {
  id: string; name: string | null; isGroup: boolean; createdById: string | null
  isAdmin: boolean; members: GroupMember[]
}

// Title shown for a conversation: the group name, or the other person's name.
function convTitle(c: Conversation): string {
  return c.isGroup ? (c.name || 'Group') : (c.otherUser?.fullName ?? 'Unknown')
}

interface Message {
  id:            string
  content:       string
  createdAt:     string
  senderId:      string
  type:          string
  attachmentUrl: string | null
  sender:        { id: string; fullName: string; role: string; avatar?: string | null }
  replyTo?:      { id: string; content: string; type: string; sender: { id: string; fullName: string } } | null
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// Shows a friendly label for non-text last messages instead of the raw filename
function lastMessagePreview(msg: { content: string; type: string } | undefined): string {
  if (!msg) return ''
  switch (msg.type) {
    case 'AUDIO': return '🎤 Voice message'
    case 'IMAGE': return '📷 Photo'
    case 'FILE':  return `📎 ${msg.content}`
    default:      return msg.content
  }
}

// WhatsApp-style "last seen" label
function lastSeenLabel(contact: Contact | null | undefined): string {
  if (!contact) return ''
  if (contact.isOnline) return 'active now'
  if (!contact.lastSeenAt) return ''

  const date = new Date(contact.lastSeenAt)
  const now  = new Date()
  const diffMins  = Math.floor((now.getTime() - date.getTime()) / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1)  return 'last seen just now'
  if (diffMins < 60) return `last seen ${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24 && date.toDateString() === now.toDateString()) {
    return `last seen ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${time}`

  return `last seen ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} at ${time}`
}

function Avatar({ name, photo, size = 40, group = false }: { name?: string; photo?: string | null; size?: number; group?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: group ? 'linear-gradient(135deg, #1E8496 0%, #0f6070 100%)' : 'linear-gradient(135deg, #8696A0 0%, #667781 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.4, fontWeight: 600, overflow: 'hidden',
    }}>
      {group ? (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ) : photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name?.charAt(0)?.toUpperCase() ?? '?')}
    </div>
  )
}

// WhatsApp-style status ticks, only shown on messages the current user sent
type TickStatus = 'sent' | 'delivered' | 'read'

function MessageTicks({ status, size = 13 }: { status: TickStatus; size?: number }) {
  const color = status === 'read' ? '#34B7F1' : WA.textSecondary
  if (status === 'sent') {
    return (
      <svg width={size} height={size * 0.7} viewBox="0 0 16 11" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="1 6 5.5 10 15 1" />
      </svg>
    )
  }
  // Wider viewBox gives the two checkmarks room to sit side by side instead of overlapping
  return (
    <svg width={size * 1.3} height={size * 0.7} viewBox="0 0 20 11" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="1 6 5 10 11 2" />
      <polyline points="6 6 10 10 19 1" />
    </svg>
  )
}

const VOICE_BAR_COUNT = 30

function formatVoiceTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Custom WhatsApp-style voice player, replaces the native browser <audio controls> UI
interface VoiceMessageProps {
  src:        string
  isMine:     boolean
  avatar?:    string | null
  senderName?: string
  time:       string
  tickStatus?: TickStatus
}

function VoiceMessage({ src, isMine, avatar, senderName, time, tickStatus }: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function onTime()   { setCurrentTime(audio!.currentTime) }
    function onLoaded()  { setDuration(audio!.duration) }
    function onEnded()  { setIsPlaying(false); setCurrentTime(0) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) { audio.pause(); setIsPlaying(false) }
    else { audio.play(); setIsPlaying(true) }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect  = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * duration
    setCurrentTime(audio.currentTime)
  }

  // Deterministic varied bar heights, stable across re-renders, looks like a waveform
  const bars = useMemo(() => Array.from({ length: VOICE_BAR_COUNT }, (_, i) =>
    28 + Math.abs(Math.sin(i * 0.7)) * 50 + Math.abs(Math.cos(i * 1.9)) * 22,
  ), [])

  const progress   = duration > 0 ? currentTime / duration : 0
  const activeBars = Math.round(progress * VOICE_BAR_COUNT)
  const playedColor = isMine ? WA.textPrimary : WA.green
  const unplayedColor = isMine ? 'rgba(17,27,33,0.22)' : 'rgba(0,0,0,0.18)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 240 }}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Avatar spans the full height of both rows below, like WhatsApp */}
      <Avatar name={senderName} photo={avatar} size={46} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" onClick={togglePlay}
            style={{
              border: 0, background: 'transparent', padding: 0, margin: 0, flexShrink: 0, cursor: 'pointer',
              color: WA.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, lineHeight: 0,
            }}>
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          <div onClick={handleSeek} style={{ position: 'relative', flex: 1, minWidth: 0, height: 24, cursor: 'pointer' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1, minWidth: 0, borderRadius: 2, height: `${h}%`,
                  background: i < activeBars ? playedColor : unplayedColor,
                }} />
              ))}
            </div>
            {duration > 0 && (
              <div style={{
                position: 'absolute', top: '50%', left: `${progress * 100}%`,
                width: 11, height: 11, borderRadius: '50%', background: '#34B7F1',
                transform: 'translate(-50%, -50%)', boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 44 }}>
          <span style={{ fontSize: 9.5, color: WA.textSecondary }}>
            {formatVoiceTime(isPlaying || currentTime > 0 ? currentTime : duration)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9.5, color: WA.textSecondary }}>{time}</span>
            {isMine && tickStatus && <MessageTicks status={tickStatus} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── New Chat modal (also reused for "Forward to…") ──────────────────────────
function NewChatModal({ onClose, onSelect, title = 'New chat' }: { onClose: () => void; onSelect: (c: Contact) => void; title?: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    api.get('/chat/contacts')
      .then(({ data }) => setContacts(data.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = contacts.filter(c => !search || c.fullName.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, fontFamily: WA_FONT }}>
      <div style={{ background: WA.panelBg, borderRadius: 8, width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${WA.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: WA.textPrimary, fontFamily: WA_FONT }}>
            {title}
          </h2>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, color: WA.textSecondary, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '12px 16px 0' }}>
          <input
            placeholder="Search people…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%', background: WA.headerBg, border: 0, borderRadius: 8,
              padding: '9px 14px', fontSize: 14, color: WA.textPrimary, outline: 'none', fontFamily: WA_FONT,
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 14px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, padding: 20 }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, padding: 20 }}>No contacts found.</p>
          ) : filtered.map(c => (
            <div key={c.id} onClick={() => onSelect(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 8, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = WA.hoverBg }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <Avatar name={c.fullName} photo={c.avatar} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 400, color: WA.textPrimary }}>{c.fullName}</p>
              </div>
              <span style={{ fontSize: 11, color: WA.textSecondary, textTransform: 'capitalize' }}>
                {c.role.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Reusable multi-select contact list (used by New group + Add members) ────
function ContactPickerList({ excludeIds = [], selected, onToggle }: {
  excludeIds?: string[]; selected: Set<string>; onToggle: (id: string) => void
}) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    api.get('/chat/contacts').then(({ data }) => setContacts(data.data ?? [])).finally(() => setLoading(false))
  }, [])

  const ex = new Set(excludeIds)
  const filtered = contacts.filter(c => !ex.has(c.id) && (!search || c.fullName.toLowerCase().includes(search.toLowerCase())))

  return (
    <>
      <div style={{ padding: '12px 16px 0' }}>
        <input placeholder="Search people…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', background: WA.headerBg, border: 0, borderRadius: 8, padding: '9px 14px', fontSize: 14, color: WA.textPrimary, outline: 'none', fontFamily: WA_FONT }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 6px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, padding: 20 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, padding: 20 }}>No contacts found.</p>
        ) : filtered.map(c => {
          const checked = selected.has(c.id)
          return (
            <div key={c.id} onClick={() => onToggle(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = WA.hoverBg }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <Avatar name={c.fullName} photo={c.avatar} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, color: WA.textPrimary }}>{c.fullName}</p>
                <p style={{ margin: 0, fontSize: 11, color: WA.textSecondary, textTransform: 'capitalize' }}>{c.role.toLowerCase()}</p>
              </div>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${checked ? WA.green : '#C4CCD1'}`, background: checked ? WA.green : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── New group modal ─────────────────────────────────────────────────────────
function NewGroupModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, memberIds: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [name, setName]         = useState('')
  const [saving, setSaving]     = useState(false)
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const canCreate = name.trim().length > 0 && selected.size > 0 && !saving
  const create = async () => { if (!canCreate) return; setSaving(true); try { await onCreate(name.trim(), [...selected]) } finally { setSaving(false) } }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, fontFamily: WA_FONT }}>
      <div style={{ background: WA.panelBg, borderRadius: 8, width: '100%', maxWidth: 440, height: '80vh', maxHeight: 640, display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${WA.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: WA.textPrimary }}>New group</h2>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, color: WA.textSecondary, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar group size={44} />
          <input placeholder="Group name" value={name} onChange={e => setName(e.target.value)} maxLength={60}
            style={{ flex: 1, border: 0, borderBottom: `2px solid ${WA.green}`, background: 'transparent', outline: 'none', fontSize: 15, color: WA.textPrimary, padding: '6px 2px', fontFamily: WA_FONT }} />
        </div>
        <p style={{ margin: 0, padding: '4px 18px 0', fontSize: 12, color: WA.textSecondary }}>
          {selected.size === 0 ? 'Select members to add' : `${selected.size} selected`}
        </p>
        <ContactPickerList selected={selected} onToggle={toggle} />
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${WA.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ border: `1px solid ${WA.border}`, background: '#fff', borderRadius: 6, padding: '8px 16px', fontSize: 14, cursor: 'pointer', color: WA.textPrimary }}>Cancel</button>
          <button onClick={create} disabled={!canCreate}
            style={{ border: 0, background: canCreate ? WA.green : '#A8D5C9', color: '#fff', borderRadius: 6, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: canCreate ? 'pointer' : 'default' }}>
            {saving ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add members to an existing group ────────────────────────────────────────
function AddMembersModal({ excludeIds, onClose, onAdd }: { excludeIds: string[]; onClose: () => void; onAdd: (ids: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving]     = useState(false)
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const canAdd = selected.size > 0 && !saving
  const add = async () => { if (!canAdd) return; setSaving(true); try { await onAdd([...selected]) } finally { setSaving(false) } }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16, fontFamily: WA_FONT }}>
      <div style={{ background: WA.panelBg, borderRadius: 8, width: '100%', maxWidth: 420, height: '76vh', maxHeight: 560, display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${WA.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: WA.textPrimary }}>Add members</h2>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, color: WA.textSecondary, lineHeight: 1 }}>×</button>
        </div>
        <ContactPickerList excludeIds={excludeIds} selected={selected} onToggle={toggle} />
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${WA.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ border: `1px solid ${WA.border}`, background: '#fff', borderRadius: 6, padding: '8px 16px', fontSize: 14, cursor: 'pointer', color: WA.textPrimary }}>Cancel</button>
          <button onClick={add} disabled={!canAdd}
            style={{ border: 0, background: canAdd ? WA.green : '#A8D5C9', color: '#fff', borderRadius: 6, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: canAdd ? 'pointer' : 'default' }}>
            {saving ? 'Adding…' : `Add${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Group info: members, rename, add/remove, leave ──────────────────────────
function GroupInfoModal({ conversationId, currentUserId, onClose, onChanged, onLeft }: {
  conversationId: string; currentUserId?: string
  onClose: () => void; onChanged: () => void; onLeft: () => void
}) {
  const [info, setInfo]         = useState<GroupInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showAdd, setShowAdd]   = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/chat/conversations/${conversationId}/group`)
      .then(({ data }) => { const g = data.data as GroupInfo; setInfo(g); setNameDraft(g?.name ?? '') })
      .finally(() => setLoading(false))
  }, [conversationId])
  useEffect(() => { load() }, [load])

  const rename = async () => {
    if (!nameDraft.trim()) return
    await api.patch(`/chat/groups/${conversationId}`, { name: nameDraft.trim() })
    setRenaming(false); load(); onChanged()
  }
  const removeMember = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the group?`)) return
    await api.delete(`/chat/groups/${conversationId}/members/${id}`); load(); onChanged()
  }
  const addMembers = async (ids: string[]) => {
    await api.post(`/chat/groups/${conversationId}/members`, { memberIds: ids }); setShowAdd(false); load(); onChanged()
  }
  const leave = async () => {
    if (!window.confirm('Leave this group? You will stop receiving its messages.')) return
    await api.post(`/chat/groups/${conversationId}/leave`); onLeft()
  }

  const isAdmin = !!info?.isAdmin

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, fontFamily: WA_FONT }}>
      <div style={{ background: WA.panelBg, borderRadius: 8, width: '100%', maxWidth: 420, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${WA.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: WA.textPrimary }}>Group info</h2>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, color: WA.textSecondary, lineHeight: 1 }}>×</button>
        </div>

        {loading || !info ? (
          <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, padding: 30 }}>Loading…</p>
        ) : (
          <>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, borderBottom: `1px solid ${WA.border}` }}>
              <Avatar group size={72} />
              {renaming ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                  <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} maxLength={60} autoFocus
                    style={{ flex: 1, border: 0, borderBottom: `2px solid ${WA.green}`, background: 'transparent', outline: 'none', fontSize: 16, textAlign: 'center', color: WA.textPrimary, fontFamily: WA_FONT }} />
                  <button onClick={rename} style={{ border: 0, background: WA.green, color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Save</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: WA.textPrimary }}>{info.name}</h3>
                  {isAdmin && (
                    <button onClick={() => setRenaming(true)} title="Rename" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: WA.textSecondary }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                  )}
                </div>
              )}
              <span style={{ fontSize: 13, color: WA.textSecondary }}>{info.members.length} member{info.members.length === 1 ? '' : 's'}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: WA.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Members</span>
                {isAdmin && (
                  <button onClick={() => setShowAdd(true)} style={{ border: 0, background: 'transparent', color: WA.green, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
                )}
              </div>
              {info.members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px' }}>
                  <Avatar name={m.fullName} photo={m.avatar} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, color: WA.textPrimary }}>
                      {m.id === currentUserId ? 'You' : m.fullName}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: WA.textSecondary, textTransform: 'capitalize' }}>{m.role?.toLowerCase()}</p>
                  </div>
                  {m.isAdmin && <span style={{ fontSize: 11, color: WA.green, fontWeight: 600, background: '#D9FDD3', borderRadius: 12, padding: '2px 8px' }}>Admin</span>}
                  {isAdmin && m.id !== currentUserId && (
                    <button onClick={() => removeMember(m.id, m.fullName)} title="Remove" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: WA.danger }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${WA.border}` }}>
              <button onClick={leave}
                style={{ width: '100%', border: 0, background: WA.dangerBg, color: WA.danger, borderRadius: 6, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Leave group
              </button>
            </div>
          </>
        )}
      </div>
      {showAdd && info && (
        <AddMembersModal excludeIds={info.members.map(m => m.id)} onClose={() => setShowAdd(false)} onAdd={addMembers} />
      )}
    </div>
  )
}

export default function ChatPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const phone = usePhone()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId,    setSelectedId]     = useState<string | null>(null)
  const [messages,      setMessages]       = useState<Message[]>([])
  const [text,          setText]           = useState('')
  const [loadingList,   setLoadingList]    = useState(true)
  const [loadingMsgs,   setLoadingMsgs]    = useState(false)
  const [showNewChat,   setShowNewChat]    = useState(false)
  const [uploading,     setUploading]      = useState(false)
  const [contextMenu,   setContextMenu]    = useState<{ x: number; y: number; conversationId: string } | null>(null)
  const [listSearch,    setListSearch]     = useState('')
  const [listFilter,    setListFilter]     = useState<'all' | 'unread'>('all')
  const [showEmoji,     setShowEmoji]      = useState(false)
  const [isRecording,   setIsRecording]    = useState(false)
  const [recordSeconds, setRecordSeconds]  = useState(0)
  const [msgMenu,       setMsgMenu]        = useState<{ x: number; y: number; message: Message } | null>(null)
  const [replyTarget,   setReplyTarget]    = useState<Message | null>(null)
  const [forwardMsg,    setForwardMsg]     = useState<Message | null>(null)
  const [showNewGroup,  setShowNewGroup]   = useState(false)
  const [groupInfoId,   setGroupInfoId]    = useState<string | null>(null)

  const bottomRef       = useRef<HTMLDivElement>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const socketRef       = useRef(getSocket())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const recordTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchConversations = useCallback((selectAfter?: string, silent = false) => {
    if (!silent) setLoadingList(true)
    api.get('/chat/conversations')
      .then(({ data }) => {
        const list: Conversation[] = data.data ?? []
        setConversations(list)
        if (!silent) {
          const target = selectAfter ?? searchParams.get('conversationId')
          if (target) setSelectedId(target)
        }
      })
      .finally(() => { if (!silent) setLoadingList(false) })
  }, [searchParams]) // eslint-disable-line

  useEffect(() => { fetchConversations() }, []) // eslint-disable-line
  useAutoRefresh(() => fetchConversations(undefined, true))

  // Ask once for permission to show desktop notifications for new messages
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoadingMsgs(true)
    api.get(`/chat/conversations/${selectedId}/messages`)
      .then(({ data }) => setMessages((data.data ?? []).slice().reverse()))
      .finally(() => setLoadingMsgs(false))

    socketRef.current.emit('join_conversation', { conversationId: selectedId })
    setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unreadCount: 0 } : c))
  }, [selectedId])

  useEffect(() => {
    const socket = socketRef.current
    function onNewMessage(msg: Message & { conversationId: string }) {
      const isFromMe = msg.senderId === user?.id || msg.sender?.id === user?.id
      const isViewingThisChat = msg.conversationId === selectedId && !document.hidden

      if (!isFromMe && !isViewingThisChat && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(msg.sender?.fullName ?? 'New message', {
          body: lastMessagePreview(msg),
          icon: '/logo.png',
          tag:  msg.conversationId, // collapses rapid notifications from the same chat
        })
      }

      if (msg.conversationId === selectedId) setMessages(prev => [...prev, msg])
      fetchConversations(selectedId ?? undefined)
    }
    socket.on('new_message', onNewMessage)
    return () => { socket.off('new_message', onNewMessage) }
  }, [selectedId, fetchConversations, user?.id])

  // Live read receipts, updates tick status on messages already on screen
  useEffect(() => {
    const socket = socketRef.current
    function onReadReceipt(data: { conversationId: string; userId: string; lastReadAt: string }) {
      setConversations(prev => prev.map(c => {
        if (c.id !== data.conversationId) return c
        return {
          ...c,
          participants: c.participants.map(p => p.userId === data.userId ? { ...p, lastReadAt: data.lastReadAt } : p),
        }
      }))
    }
    socket.on('read_receipt', onReadReceipt)
    return () => { socket.off('read_receipt', onReadReceipt) }
  }, [])

  // Live online/last-seen updates, patch the matching conversation's otherUser in place
  useEffect(() => {
    const socket = socketRef.current
    function onPresence(data: { userId: string; online: boolean; lastSeenAt?: string }) {
      setConversations(prev => prev.map(c =>
        c.otherUser?.id === data.userId
          ? { ...c, otherUser: { ...c.otherUser, isOnline: data.online, lastSeenAt: data.lastSeenAt ?? c.otherUser.lastSeenAt } }
          : c,
      ))
    }
    socket.on('presence_update', onPresence)
    return () => { socket.off('presence_update', onPresence) }
  }, [])

  // Live message deletion, remove from view the instant it's deleted by anyone
  useEffect(() => {
    const socket = socketRef.current
    function onMessageDeleted(data: { messageId: string; conversationId: string }) {
      if (data.conversationId === selectedId) {
        setMessages(prev => prev.filter(m => m.id !== data.messageId))
      }
    }
    socket.on('message_deleted', onMessageDeleted)
    return () => { socket.off('message_deleted', onMessageDeleted) }
  }, [selectedId])

  // Dismiss the right-click context menu on any outside click
  useEffect(() => {
    if (!contextMenu) return
    function dismiss() { setContextMenu(null) }
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [contextMenu])

  // Dismiss the message options menu on any outside click
  useEffect(() => {
    if (!msgMenu) return
    function dismiss() { setMsgMenu(null) }
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [msgMenu])

  // Dismiss the emoji picker on any outside click
  useEffect(() => {
    if (!showEmoji) return
    function dismiss() { setShowEmoji(false) }
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [showEmoji])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !selectedId) return
    socketRef.current.emit('send_message', {
      conversationId: selectedId,
      content:        text.trim(),
      type:           'TEXT',
      replyToId:      replyTarget?.id,
    })
    setText('')
    setReplyTarget(null)
  }

  // ── Message-level actions (right-click menu) ────────────────────────────────

  function handleMessageContextMenu(e: React.MouseEvent, message: Message) {
    e.preventDefault()
    const itemCount = 2 + (message.attachmentUrl ? 1 : 0) + 1 + 1 // Reply, Copy, [Download], Forward, Delete
    const pos = clampMenuPosition(e.clientX, e.clientY, 200, itemCount * 42 + 8)
    setMsgMenu({ x: pos.x, y: pos.y, message })
  }

  function handleReply(message: Message) {
    setMsgMenu(null)
    setReplyTarget(message)
  }

  async function handleCopyMessage(message: Message) {
    setMsgMenu(null)
    try { await navigator.clipboard.writeText(message.content) } catch { /* ignore */ }
  }

  async function handleDeleteMessage(message: Message) {
    setMsgMenu(null)
    if (!window.confirm('Delete this message for you? The other person will still see it.')) return
    socketRef.current.emit('delete_message', { messageId: message.id })
    setMessages(prev => prev.filter(m => m.id !== message.id))
  }

  async function handleDownloadAttachment(message: Message) {
    setMsgMenu(null)
    if (!message.attachmentUrl) return
    const url = `${FILE_BASE_URL}${message.attachmentUrl}`
    const res  = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = message.content || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  }

  function handleForwardClick(message: Message) {
    setMsgMenu(null)
    setForwardMsg(message)
  }

  async function handleForwardToContact(contact: Contact) {
    if (!forwardMsg) return
    const { data } = await api.post('/chat/conversations/direct', { userId: contact.id })
    const conv = data.data
    socketRef.current.emit('send_message', {
      conversationId: conv.id,
      content:        forwardMsg.content,
      type:           forwardMsg.type,
      attachmentUrl:  forwardMsg.attachmentUrl ?? undefined,
    })
    setForwardMsg(null)
    fetchConversations(conv.id)
  }

  async function handleSelectContact(contact: Contact) {
    setShowNewChat(false)
    const { data } = await api.post('/chat/conversations/direct', { userId: contact.id })
    const conv = data.data
    fetchConversations(conv.id)
  }

  async function handleCreateGroup(name: string, memberIds: string[]) {
    const { data } = await api.post('/chat/groups', { name, memberIds })
    const conv = data.data
    setShowNewGroup(false)
    fetchConversations(conv.id)
  }

  async function handleDeleteConversation(conversationId: string) {
    setContextMenu(null)
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return
    await api.delete(`/chat/conversations/${conversationId}`)
    setConversations(prev => prev.filter(c => c.id !== conversationId))
    if (selectedId === conversationId) {
      setSelectedId(null)
      setMessages([])
    }
  }

  async function handleLeaveGroup(conversationId: string) {
    setContextMenu(null)
    if (!window.confirm('Leave this group? You will stop receiving its messages.')) return
    await api.post(`/chat/groups/${conversationId}/leave`)
    setConversations(prev => prev.filter(c => c.id !== conversationId))
    if (selectedId === conversationId) {
      setSelectedId(null)
      setMessages([])
    }
  }

  function handleContextMenu(e: React.MouseEvent, conversationId: string) {
    e.preventDefault()
    const pos = clampMenuPosition(e.clientX, e.clientY, 190, 60)
    setContextMenu({ x: pos.x, y: pos.y, conversationId })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/chat/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const { url, type, fileName } = data.data
      socketRef.current.emit('send_message', { conversationId: selectedId, content: fileName, type, attachmentUrl: url, replyToId: replyTarget?.id })
      setReplyTarget(null)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // ── Voice messages ───────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start()

      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch {
      alert('Microphone access is required to send a voice message.')
    }
  }

  function stopRecordingTracks() {
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setIsRecording(false)
    setRecordSeconds(0)
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    recorder.onstop = null
    recorder.stop()
    stopRecordingTracks()
  }

  async function sendRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || !selectedId) return

    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', blob, `voice-${Date.now()}.webm`)
        const { data } = await api.post('/chat/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        const { url, type, fileName } = data.data
        socketRef.current.emit('send_message', { conversationId: selectedId, content: fileName, type, attachmentUrl: url, replyToId: replyTarget?.id })
        setReplyTarget(null)
      } finally {
        setUploading(false)
      }
    }

    recorder.stop()
    stopRecordingTracks()
  }

  const selectedConv = conversations.find(c => c.id === selectedId)

  // Determines which tick to show on a message I sent: sent → delivered → read
  function getTickStatus(conv: Conversation | undefined, createdAt: string): TickStatus {
    if (!conv) return 'sent'
    const otherParticipant = conv.participants?.find(p => p.userId !== user?.id)
    const isRead = !!otherParticipant?.lastReadAt && new Date(otherParticipant.lastReadAt) >= new Date(createdAt)
    if (isRead) return 'read'
    if (conv.otherUser?.isOnline) return 'delivered'
    return 'sent'
  }

  const visibleConversations = conversations.filter(c => {
    const lastMsg = c.messages?.[0]
    if (listFilter === 'unread' && (c.unreadCount ?? 0) === 0) return false
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return convTitle(c).toLowerCase().includes(q) || lastMsg?.content?.toLowerCase().includes(q)
  })

  return (
    <div style={{ display: 'flex', height: '100vh', background: WA.panelBg, fontFamily: WA_FONT }}>
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onSelect={handleSelectContact} />}
      {forwardMsg && <NewChatModal title="Forward to…" onClose={() => setForwardMsg(null)} onSelect={handleForwardToContact} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} onCreate={handleCreateGroup} />}
      {groupInfoId && (
        <GroupInfoModal
          conversationId={groupInfoId}
          currentUserId={user?.id}
          onClose={() => setGroupInfoId(null)}
          onChanged={() => fetchConversations(undefined, true)}
          onLeft={() => {
            const gid = groupInfoId
            setGroupInfoId(null)
            if (selectedId === gid) { setSelectedId(null); setMessages([]) }
            fetchConversations(undefined, true)
          }}
        />
      )}

      {/* Conversation list, on a phone this is a whole screen, not a 380px rail
          sitting next to the thread. Opening a chat swaps it out entirely,
          the way WhatsApp does it. */}
      <div style={{
        width: phone ? '100%' : 380,
        flexShrink: 0,
        borderRight: phone ? 'none' : `1px solid ${WA.border}`,
        display: phone && selectedConv ? 'none' : 'flex',
        flexDirection: 'column',
        background: WA.panelBg,
      }}>
        {/* 52px band with no top padding, matching the sidebar brand header, so
            "Chats" lines up with ASIF ASSOCIATES the way the other pages do. */}
        <div style={{ padding: phone ? '16px 16px 16px 58px' : '0 20px', minHeight: phone ? undefined : 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 26, color: '#1E8496', margin: 0, fontFamily: "'Faster One', cursive", textTransform: 'uppercase', lineHeight: 1.15 }}>
            Chats
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => setShowNewGroup(true)} title="New group"
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
                background: 'transparent', color: WA.textSecondary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = WA.hoverBg }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            <button onClick={() => setShowNewChat(true)} title="New chat"
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
                background: 'transparent', color: WA.textSecondary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = WA.hoverBg }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: WA.headerBg, borderRadius: 8, padding: '8px 12px',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={WA.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              placeholder="Search or start a new chat"
              style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 14, color: WA.textPrimary, fontFamily: WA_FONT }}
            />
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
          {(['all', 'unread'] as const).map(f => {
            const active = listFilter === f
            return (
              <button key={f} onClick={() => setListFilter(f)}
                style={{
                  border: 0, borderRadius: 16, padding: '6px 14px', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: WA_FONT,
                  background: active ? '#D9FDD3' : WA.headerBg,
                  color: active ? WA.green : WA.textPrimary,
                }}>
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingList ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: `1px solid ${WA.border}` }}>
                <div style={{ height: 12, width: '60%', background: WA.headerBg, borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 10, width: '80%', background: WA.headerBg, borderRadius: 4 }} />
              </div>
            ))
          ) : conversations.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ color: WA.textSecondary, fontSize: 13, marginBottom: 12 }}>No conversations yet.</p>
              <button onClick={() => setShowNewChat(true)}
                style={{ background: WA.green, color: '#fff', border: 0, borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Start a Chat
              </button>
            </div>
          ) : visibleConversations.length === 0 ? (
            <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, padding: '32px 20px' }}>No chats found.</p>
          ) : visibleConversations.map(c => {
            const isActive    = c.id === selectedId
            const lastMsg     = c.messages?.[0]
            const unreadCount = c.unreadCount ?? 0
            const isUnread    = unreadCount > 0

            return (
              <div key={c.id}
                onClick={() => setSelectedId(c.id)}
                onContextMenu={e => handleContextMenu(e, c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 20px', cursor: 'pointer',
                  background: isActive ? WA.activeBg : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = WA.hoverBg }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={c.otherUser?.fullName} photo={c.otherUser?.avatar} group={c.isGroup} />
                  {!c.isGroup && c.otherUser?.isOnline && (
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1, width: 11, height: 11,
                      borderRadius: '50%', background: WA.online, border: `2px solid ${WA.panelBg}`,
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${WA.border}`, paddingTop: 12, paddingBottom: 12, marginTop: -12, marginBottom: -12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 15, fontWeight: 400, color: WA.textPrimary }}>
                      {convTitle(c)}
                    </span>
                    <span style={{ fontSize: 12, color: isUnread ? WA.green : WA.textSecondary, fontWeight: isUnread ? 600 : 400 }}>{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  {lastMsg && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                        {!c.isGroup && lastMsg.sender?.id === user?.id && (
                          <MessageTicks status={getTickStatus(c, lastMsg.createdAt)} size={12} />
                        )}
                        <p style={{
                          margin: 0, fontSize: 13, color: isUnread ? WA.textPrimary : WA.textSecondary,
                          fontWeight: isUnread ? 600 : 400,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {c.isGroup && lastMsg.sender ? `${lastMsg.sender.id === user?.id ? 'You' : lastMsg.sender.fullName.split(' ')[0]}: ` : ''}{lastMessagePreview(lastMsg)}
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <span style={{
                          background: WA.online, color: '#fff', fontSize: 11, fontWeight: 700,
                          borderRadius: 9999, minWidth: 19, height: 19, padding: '0 5px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 2000,
            background: '#fff', borderRadius: 6, border: `1px solid ${WA.border}`,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)', overflow: 'hidden', minWidth: 170,
          }}>
          {conversations.find(c => c.id === contextMenu.conversationId)?.isGroup ? (
            <button
              onClick={() => handleLeaveGroup(contextMenu.conversationId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '11px 16px', border: 0, background: 'transparent', cursor: 'pointer',
                color: WA.danger, fontSize: 14, fontWeight: 400, textAlign: 'left', fontFamily: WA_FONT,
              }}
              onMouseEnter={ev => { ev.currentTarget.style.background = WA.dangerBg }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Leave group
            </button>
          ) : (
            <button
              onClick={() => handleDeleteConversation(contextMenu.conversationId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '11px 16px', border: 0, background: 'transparent', cursor: 'pointer',
                color: WA.danger, fontSize: 14, fontWeight: 400, textAlign: 'left', fontFamily: WA_FONT,
              }}
              onMouseEnter={ev => { ev.currentTarget.style.background = WA.dangerBg }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete conversation
            </button>
          )}
        </div>
      )}

      {/* Message options menu (right-click on a message bubble) */}
      {msgMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: msgMenu.y, left: msgMenu.x, zIndex: 2000,
            background: '#fff', borderRadius: 6, border: `1px solid ${WA.border}`,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)', overflow: 'hidden', minWidth: 180,
          }}>
          {[
            { label: 'Reply',   onClick: () => handleReply(msgMenu.message), icon: 'M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-1' },
            { label: 'Copy',    onClick: () => handleCopyMessage(msgMenu.message), icon: 'M9 9h10v10H9V9zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1' },
            ...(msgMenu.message.attachmentUrl
              ? [{ label: 'Download', onClick: () => handleDownloadAttachment(msgMenu.message), icon: 'M12 3v12m0 0l-4-4m4 4l4-4M5 19h14' }]
              : []),
            { label: 'Forward', onClick: () => handleForwardClick(msgMenu.message), icon: 'M14 5l6 6-6 6M4 11h14' },
            { label: 'Delete', onClick: () => handleDeleteMessage(msgMenu.message), icon: 'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z', danger: true },
          ].map(item => (
            <button key={item.label} onClick={item.onClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 16px', border: 0, background: 'transparent', cursor: 'pointer',
                color: item.danger ? WA.danger : WA.textPrimary, fontSize: 14, fontWeight: 400, textAlign: 'left', fontFamily: WA_FONT,
              }}
              onMouseEnter={ev => { ev.currentTarget.style.background = item.danger ? WA.dangerBg : WA.hoverBg }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      <div style={{
        flex: 1,
        minWidth: 0,
        // Nothing to show next to the list on a phone: with no chat open the
        // list is the screen, so the empty "pick a conversation" pane would
        // just be a blank half.
        display: phone && !selectedConv ? 'none' : 'flex',
        flexDirection: 'column',
        background: WA.chatBg,
      }}>
        {!selectedConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WA.textSecondary, fontSize: 14 }}>
            Select a conversation or start a new chat
          </div>
        ) : (
          <>
            <div
              onContextMenu={e => handleContextMenu(e, selectedConv.id)}
              style={{ padding: phone ? '8px 12px' : '10px 20px', display: 'flex', alignItems: 'center', gap: phone ? 10 : 14, background: WA.panelBg, borderBottom: `1px solid ${WA.border}` }}>
              {/* The list is gone on a phone, so this is the only way back to it. */}
              {phone && (
                <button onClick={() => setSelectedId(null)} aria-label="Back to chats"
                  style={{
                    background: 'transparent', border: 0, cursor: 'pointer', color: WA.textSecondary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, marginLeft: -4, flexShrink: 0,
                  }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
              )}
              <div
                onClick={() => { if (selectedConv.isGroup) setGroupInfoId(selectedConv.id) }}
                style={{ display: 'flex', alignItems: 'center', gap: phone ? 10 : 14, minWidth: 0, flex: 1, cursor: selectedConv.isGroup ? 'pointer' : 'default' }}>
                <Avatar name={selectedConv.otherUser?.fullName} photo={selectedConv.otherUser?.avatar} group={selectedConv.isGroup} size={phone ? 34 : 40} />
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: WA.textPrimary, fontFamily: WA_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {convTitle(selectedConv)}
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: WA.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedConv.isGroup
                      ? `${selectedConv.memberCount ?? selectedConv.participants.length} members`
                      : lastSeenLabel(selectedConv.otherUser)}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 5%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {loadingMsgs ? (
                <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13 }}>Loading…</p>
              ) : messages.length === 0 ? (
                <p style={{ textAlign: 'center', color: WA.textSecondary, fontSize: 13, marginTop: 40 }}>No messages yet. Say hello!</p>
              ) : messages.map(m => {
                const isMine = m.senderId === user?.id || m.sender?.id === user?.id
                const isImage = m.type === 'IMAGE'
                const isFile   = m.type === 'FILE'
                const isAudio  = m.type === 'AUDIO'
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div
                      onContextMenu={e => handleMessageContextMenu(e, m)}
                      style={{
                        maxWidth: '65%',
                        background: isMine ? WA.sentBubble : WA.receivedBubble,
                        color: WA.textPrimary,
                        borderRadius: 7.5,
                        boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                        padding: isImage ? 6 : isAudio ? '8px 10px 6px' : '6px 9px 8px',
                        overflow: 'hidden',
                      }}>
                      <p style={{ margin: isImage ? '4px 8px 4px' : '0 0 2px', fontSize: 12.5, fontWeight: 600, color: WA.green }}>
                        {isMine ? 'You' : m.sender?.fullName}
                      </p>

                      {m.replyTo && (
                        <div style={{
                          background: 'rgba(0,0,0,0.05)', borderLeft: `3px solid ${WA.green}`,
                          borderRadius: 4, padding: '4px 8px', marginBottom: 4,
                        }}>
                          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: WA.green }}>{m.replyTo.sender?.fullName}</p>
                          <p style={{
                            margin: 0, fontSize: 12, color: WA.textSecondary,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
                          }}>
                            {m.replyTo.type === 'TEXT' ? m.replyTo.content : `📎 ${m.replyTo.content}`}
                          </p>
                        </div>
                      )}

                      {isImage && m.attachmentUrl && (
                        <a href={`${FILE_BASE_URL}${m.attachmentUrl}`} target="_blank" rel="noopener noreferrer">
                          <img src={`${FILE_BASE_URL}${m.attachmentUrl}`} alt={m.content}
                            style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6, display: 'block' }} />
                        </a>
                      )}

                      {isFile && m.attachmentUrl && (
                        <a href={`${FILE_BASE_URL}${m.attachmentUrl}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span style={{ fontSize: 14, fontWeight: 500, wordBreak: 'break-all' }}>{m.content}</span>
                        </a>
                      )}

                      {isAudio && m.attachmentUrl && (
                        <VoiceMessage
                          src={`${FILE_BASE_URL}${m.attachmentUrl}`}
                          isMine={isMine}
                          avatar={isMine ? user?.avatar : m.sender?.avatar}
                          senderName={isMine ? 'You' : m.sender?.fullName}
                          time={new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          tickStatus={isMine && !selectedConv.isGroup ? getTickStatus(selectedConv, m.createdAt) : undefined}
                        />
                      )}

                      {m.type === 'TEXT' && <p style={{ margin: 0, fontSize: 14.2, lineHeight: 1.4 }}>{m.content}</p>}

                      {!isAudio && (
                        <div style={{
                          margin: isImage ? '4px 8px 0' : '2px 0 0', display: 'flex',
                          alignItems: 'center', justifyContent: 'flex-end', gap: 4,
                        }}>
                          <span style={{ fontSize: 11, color: WA.textSecondary }}>
                            {new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                          {isMine && !selectedConv.isGroup && <MessageTicks status={getTickStatus(selectedConv, m.createdAt)} />}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* "Replying to…" banner */}
            {replyTarget && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: WA.chatBg, padding: '8px 16px 0',
              }}>
                <div style={{
                  flex: 1, background: '#fff', borderLeft: `3px solid ${WA.green}`, borderRadius: 6,
                  padding: '6px 10px', display: 'flex', flexDirection: 'column',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: WA.green }}>{replyTarget.sender?.fullName}</span>
                  <span style={{ fontSize: 12.5, color: WA.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {replyTarget.type === 'TEXT' ? replyTarget.content : `📎 ${replyTarget.content}`}
                  </span>
                </div>
                <button type="button" onClick={() => setReplyTarget(null)}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', color: WA.textSecondary, fontSize: 20, padding: '0 10px', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            )}

            <form onSubmit={handleSend} style={{ position: 'relative', display: 'flex', gap: 10, padding: '12px 16px', background: WA.chatBg, alignItems: 'center' }}>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />

              {/* Emoji picker popover */}
              {showEmoji && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', bottom: '100%', left: 16, marginBottom: 8,
                    background: '#fff', borderRadius: 10, boxShadow: '0 2px 14px rgba(0,0,0,0.2)',
                    padding: 10, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, zIndex: 10,
                  }}>
                  {QUICK_EMOJIS.map(em => (
                    <button key={em} type="button" onClick={() => { setText(t => t + em); setShowEmoji(false) }}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6 }}
                      onMouseEnter={e => { e.currentTarget.style.background = WA.hoverBg }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      {em}
                    </button>
                  ))}
                </div>
              )}

              {isRecording ? (
                <>
                  {/* Recording indicator, replaces the pill while recording */}
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                    background: '#fff', borderRadius: 24, padding: '8px 16px',
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%', background: WA.danger,
                      animation: 'wa-rec-pulse 1.2s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: 14, color: WA.textPrimary, fontFamily: WA_FONT }}>
                      {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 13, color: WA.textSecondary, marginLeft: 'auto' }}>Recording…</span>
                  </div>

                  <button type="button" onClick={cancelRecording} title="Cancel"
                    style={{
                      width: 40, height: 40, borderRadius: '50%', border: 0, flexShrink: 0,
                      background: 'transparent', color: WA.danger, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>

                  <button type="button" onClick={sendRecording} title="Send voice message"
                    style={{
                      width: 40, height: 40, borderRadius: '50%', border: 0, flexShrink: 0,
                      background: WA.green, color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>

                  <style>{`@keyframes wa-rec-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
                </>
              ) : (
                <>
                  {/* Single pill containing + / emoji / text / mic */}
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                    background: '#fff', borderRadius: 24, padding: '6px 8px 6px 12px',
                  }}>
                    {/* "+" attach */}
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      title="Attach file"
                      style={{
                        border: 0, background: 'transparent', cursor: 'pointer', flexShrink: 0,
                        color: WA.textSecondary, opacity: uploading ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
                      }}>
                      {uploading ? '…' : (
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </button>

                    {/* Emoji */}
                    <button type="button" onClick={e => { e.stopPropagation(); setShowEmoji(s => !s) }}
                      title="Emoji"
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', flexShrink: 0, color: WA.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9" y2="9.01" /><line x1="15" y1="9" x2="15" y2="9.01" />
                      </svg>
                    </button>

                    <input
                      value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Type a message"
                      style={{
                        flex: 1, background: 'transparent', border: 0,
                        padding: '5px 0', fontSize: 14.5, color: WA.textPrimary, outline: 'none', fontFamily: WA_FONT,
                      }}
                    />

                    {/* Mic, only shown inside the pill when there's no text; click to start recording */}
                    {!text.trim() && (
                      <button type="button" onClick={startRecording} title="Record voice message"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          border: 0, background: 'transparent', color: WA.textSecondary, padding: 4, cursor: 'pointer',
                        }}>
                        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                          <path d="M19 10v2a7 7 0 01-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Send, appears only once there's text to send */}
                  {text.trim() && (
                    <button type="submit"
                      style={{
                        width: 40, height: 40, borderRadius: '50%', border: 0, flexShrink: 0,
                        background: WA.green, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
