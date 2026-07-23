'use client'

import { useState } from 'react'
import { APP_REFRESH_EVENT } from '@/hooks/useAutoRefresh'

// One floating button that refetches whatever page is showing. It fires the
// page's existing refetch (via APP_REFRESH_EVENT) rather than reloading the
// browser, so it is near instant and never loses scroll position or filters.
export default function RefreshButton({ compact }: { compact: boolean }) {
  const [spinning, setSpinning] = useState(false)

  const onClick = () => {
    window.dispatchEvent(new Event(APP_REFRESH_EVENT))
    // The refetch is silent, so spin briefly just to acknowledge the tap.
    setSpinning(true)
    setTimeout(() => setSpinning(false), 700)
  }

  return (
    <button
      onClick={onClick}
      title="Refresh this page"
      aria-label="Refresh this page"
      style={{
        position:       'fixed',
        // Clear of the compact hamburger (top-left) and any page controls up
        // top, so it never sits on a heading or a filter bar.
        bottom:         compact ? 18 : 22,
        right:          compact ? 18 : 22,
        zIndex:         35,
        width:          compact ? 46 : 44,
        height:         compact ? 46 : 44,
        borderRadius:   '50%',
        border:         'none',
        cursor:         'pointer',
        background:     'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)',
        color:          '#fff',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        boxShadow:      '0 6px 18px -4px rgba(19,46,87,0.45)',
        transition:     'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 22px -4px rgba(19,46,87,0.55)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 18px -4px rgba(19,46,87,0.45)' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: spinning ? 'spin 0.7s linear' : 'none' }}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  )
}
