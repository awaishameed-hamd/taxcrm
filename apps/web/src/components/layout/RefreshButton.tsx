'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { APP_REFRESH_EVENT } from '@/hooks/useAutoRefresh'

// One floating button that refetches whatever page is showing. It fires the
// page's existing refetch (via APP_REFRESH_EVENT) rather than reloading the
// browser, so it is near instant and keeps scroll position and filters.
//
// Single click refreshes. Dragging is deliberately behind a double click, so
// the button reads as an ordinary button and never shows a move cursor until
// you ask for it. Each page remembers where it was left, keyed by pathname.

const KEY = (path: string) => `refreshBtnPos:${path}`
const DRAG_THRESHOLD = 4

type Pos = { x: number; y: number }

export default function RefreshButton({ compact }: { compact: boolean }) {
  const pathname = usePathname()
  const size     = compact ? 48 : 46
  const margin   = compact ? 18 : 22

  const [pos, setPos]           = useState<Pos | null>(null)
  const [spinning, setSpinning] = useState(false)
  // "armed" = move mode, entered by double click. Only then does it drag.
  const [armed, setArmed]       = useState(false)
  const [grabbing, setGrabbing] = useState(false)

  const armedRef    = useRef(false)
  const drag        = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)
  const suppressTap = useRef(false)

  const setArmedBoth = (v: boolean) => { armedRef.current = v; setArmed(v) }

  const clamp = useCallback((p: Pos): Pos => ({
    x: Math.min(Math.max(8, p.x), window.innerWidth  - size - 8),
    y: Math.min(Math.max(8, p.y), window.innerHeight - size - 8),
  }), [size])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(pathname))
      setPos(raw ? clamp(JSON.parse(raw)) : null)
    } catch { setPos(null) }
    setArmedBoth(false)
  }, [pathname, clamp])

  useEffect(() => {
    const onResize = () => setPos(p => (p ? clamp(p) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const refresh = () => {
    window.dispatchEvent(new Event(APP_REFRESH_EVENT))
    setSpinning(true)
    setTimeout(() => setSpinning(false), 750)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!armedRef.current) return   // not in move mode, let it behave as a button
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
    if (!grabbing) setGrabbing(true)
    setPos(clamp({ x: d.baseX + dx, y: d.baseY + dy }))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    setGrabbing(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (!d) return
    if (d.moved) {
      setPos(cur => {
        if (cur) { try { localStorage.setItem(KEY(pathname), JSON.stringify(cur)) } catch { /* quota */ } }
        return cur
      })
    }
    // Leaving move mode after a drag (or a stray press) drops the move cursor.
    setArmedBoth(false)
    suppressTap.current = true   // the click that follows this pointerup is not a refresh
  }

  const onClick = () => {
    if (suppressTap.current) { suppressTap.current = false; return }
    if (armedRef.current) { setArmedBoth(false); return }   // a click cancels move mode
    refresh()
  }

  // Double click arms move mode. The two clicks refresh twice on the way in,
  // which is harmless since a refetch is idempotent.
  const onDoubleClick = () => setArmedBoth(true)

  const placement: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: margin, bottom: margin }
  const cursor = grabbing ? 'grabbing' : armed ? 'grab' : 'pointer'

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={armed ? 'Drag to move, click to keep it here' : 'Refresh (double click to move)'}
      aria-label="Refresh this page"
      style={{
        position:       'fixed',
        ...placement,
        zIndex:         35,
        width:          size,
        height:         size,
        borderRadius:   '50%',
        border:         armed ? '2px solid rgba(242,172,24,0.9)' : 'none',
        cursor,
        // Softer than the old hard gradient: a gentle teal with a faint top
        // highlight, and a diffuse shadow instead of a tight dark one.
        background:     'radial-gradient(120% 120% at 30% 20%, #279AAD 0%, #1E8496 45%, #17707F 100%)',
        color:          '#fff',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        boxShadow:      grabbing
          ? '0 14px 34px -8px rgba(19,46,87,0.45), 0 2px 8px rgba(19,46,87,0.18)'
          : '0 8px 24px -8px rgba(30,132,150,0.5), 0 1px 4px rgba(19,46,87,0.12)',
        transform:      grabbing ? 'scale(1.06)' : 'none',
        transition:     grabbing ? 'none' : 'transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s ease',
        touchAction:    'none',
        WebkitTapHighlightColor: 'transparent',
        outline:        'none',
      }}
      onMouseEnter={e => { if (!grabbing) { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 12px 30px -8px rgba(30,132,150,0.6), 0 2px 6px rgba(19,46,87,0.15)' } }}
      onMouseLeave={e => { if (!grabbing) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(30,132,150,0.5), 0 1px 4px rgba(19,46,87,0.12)' } }}
    >
      {/* Loading-style ring: a faint full circle with a gold arc riding on it,
          which spins while the page refetches. */}
      <svg width={compact ? 24 : 22} height={compact ? 24 : 22} viewBox="0 0 24 24" fill="none"
        style={{
          animation:     spinning ? 'spin 0.75s cubic-bezier(.4,.1,.3,1)' : 'none',
          pointerEvents: 'none',
          display:       'block',
        }}>
        <circle cx="12" cy="12" r="8.5" stroke="rgba(255,255,255,0.32)" strokeWidth="2.4" />
        <path d="M12 3.5 a8.5 8.5 0 0 1 8.5 8.5" stroke="#F2AC18" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}
