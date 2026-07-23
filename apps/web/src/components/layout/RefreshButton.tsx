'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { APP_REFRESH_EVENT } from '@/hooks/useAutoRefresh'

// One floating button that refetches whatever page is showing. It fires the
// page's existing refetch (via APP_REFRESH_EVENT) rather than reloading the
// browser, so it is near instant and keeps scroll position and filters.
//
// Press and drag to move it; a press that does not move is a refresh tap. The
// grab cursor only appears once a drag actually starts, so a plain hover or a
// click stays an ordinary pointer. Each page remembers where it was left.

const KEY = (path: string) => `refreshBtnPos:${path}`
const DRAG_THRESHOLD = 4

type Pos = { x: number; y: number }

export default function RefreshButton({ compact }: { compact: boolean }) {
  const pathname = usePathname()
  const size     = compact ? 48 : 46
  const margin   = compact ? 18 : 22

  const [pos, setPos]           = useState<Pos | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [grabbing, setGrabbing] = useState(false)

  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)

  const clamp = useCallback((p: Pos): Pos => ({
    x: Math.min(Math.max(8, p.x), window.innerWidth  - size - 8),
    y: Math.min(Math.max(8, p.y), window.innerHeight - size - 8),
  }), [size])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(pathname))
      setPos(raw ? clamp(JSON.parse(raw)) : null)
    } catch { setPos(null) }
  }, [pathname, clamp])

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
    // No cursor change and no move until the press clearly becomes a drag.
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
      // Was a drag: remember the new spot for this page, no refresh.
      setPos(cur => {
        if (cur) { try { localStorage.setItem(KEY(pathname), JSON.stringify(cur)) } catch { /* quota */ } }
        return cur
      })
    } else {
      refresh()
    }
  }

  const placement: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: margin, bottom: margin }

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Refresh (drag to move)"
      aria-label="Refresh this page"
      style={{
        position:       'fixed',
        ...placement,
        zIndex:         35,
        width:          size,
        height:         size,
        borderRadius:   '50%',
        border:         'none',
        // Ordinary pointer at rest and on hover; the grab hand only shows once
        // an actual drag has begun.
        cursor:         grabbing ? 'grabbing' : 'pointer',
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
      <svg width={compact ? 22 : 20} height={compact ? 22 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: spinning ? 'spin 0.7s cubic-bezier(.4,.1,.3,1)' : 'none', pointerEvents: 'none' }}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  )
}
