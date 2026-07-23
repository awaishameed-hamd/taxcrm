'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { APP_REFRESH_EVENT } from '@/hooks/useAutoRefresh'

// One floating button that refetches whatever page is showing. It fires the
// page's existing refetch (via APP_REFRESH_EVENT) rather than reloading the
// browser, so it is near instant and keeps scroll position and filters.
//
// It can be dragged anywhere, and each page remembers where it was left, keyed
// by pathname in localStorage. A short drag counts as a tap so the button still
// refreshes when you just click it.

const KEY = (path: string) => `refreshBtnPos:${path}`
const DRAG_THRESHOLD = 5   // px of movement before a press is treated as a drag

type Pos = { x: number; y: number }

export default function RefreshButton({ compact }: { compact: boolean }) {
  const pathname = usePathname()
  const size     = compact ? 46 : 44
  const margin   = compact ? 18 : 22

  // null means "not placed yet on this page", so fall back to the bottom-right corner.
  const [pos, setPos]           = useState<Pos | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [dragging, setDragging] = useState(false)

  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)

  const clamp = useCallback((p: Pos): Pos => ({
    x: Math.min(Math.max(8, p.x), window.innerWidth  - size - 8),
    y: Math.min(Math.max(8, p.y), window.innerHeight - size - 8),
  }), [size])

  // Load this page's saved spot whenever the route changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(pathname))
      setPos(raw ? clamp(JSON.parse(raw)) : null)
    } catch { setPos(null) }
  }, [pathname, clamp])

  // Keep it on screen if the window is resized smaller.
  useEffect(() => {
    const onResize = () => setPos(p => (p ? clamp(p) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const refresh = () => {
    window.dispatchEvent(new Event(APP_REFRESH_EVENT))
    setSpinning(true)
    setTimeout(() => setSpinning(false), 700)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: r.left, baseY: r.top, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    if (!dragging) setDragging(true)
    setPos(clamp({ x: d.baseX + dx, y: d.baseY + dy }))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (!d) return
    if (d.moved) {
      // Remember where it was dropped, for this page only.
      setPos(cur => {
        if (cur) { try { localStorage.setItem(KEY(pathname), JSON.stringify(cur)) } catch { /* quota */ } }
        return cur
      })
    } else {
      refresh()
    }
  }

  const placement: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: margin, bottom: margin }

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Refresh this page (drag to move)"
      aria-label="Refresh this page"
      style={{
        position:       'fixed',
        ...placement,
        zIndex:         35,
        width:          size,
        height:         size,
        borderRadius:   '50%',
        border:         'none',
        cursor:         dragging ? 'grabbing' : 'grab',
        background:     'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)',
        color:          '#fff',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        boxShadow:      dragging ? '0 12px 28px -4px rgba(19,46,87,0.6)' : '0 6px 18px -4px rgba(19,46,87,0.45)',
        transform:      dragging ? 'scale(1.08)' : 'none',
        transition:     dragging ? 'none' : 'transform .15s, box-shadow .15s',
        touchAction:    'none',   // stop the page scrolling while dragging on touch
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: spinning ? 'spin 0.7s linear' : 'none', pointerEvents: 'none' }}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  )
}
