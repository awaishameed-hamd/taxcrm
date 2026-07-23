'use client'

import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import RefreshButton from './RefreshButton'
import { useIdleLogout } from '@/hooks/useIdleLogout'
import { useCompact } from '@/hooks/useMediaQuery'

interface AppLayoutProps {
  children:                  React.ReactNode
  sidebarCollapsed?:         boolean
  onSidebarCollapsedChange?: (v: boolean) => void
}

export default function AppLayout({
  children,
  sidebarCollapsed,
  onSidebarCollapsedChange,
}: AppLayoutProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const compact = useCompact()

  useIdleLogout()

  const collapsed   = sidebarCollapsed         !== undefined ? sidebarCollapsed         : internalCollapsed
  const setCollapsed = onSidebarCollapsedChange !== undefined ? onSidebarCollapsedChange : setInternalCollapsed

  // A phone can't spare 256px to a permanently open drawer, so it starts shut.
  // Crossing the breakpoint (rotating, resizing) re-applies the right default
  // rather than leaving the drawer stuck open over the content.
  useEffect(() => { setCollapsed(compact) }, [compact])   // eslint-disable-line react-hooks/exhaustive-deps

  const drawerOpen = compact && !collapsed

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EDF0F3' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} compact={compact} />

      {/* Tap-anywhere-else to dismiss the drawer. Compact only, on desktop the
          sidebar is part of the layout and nothing should dim behind it. */}
      {drawerOpen && (
        <div
          onClick={() => setCollapsed(true)}
          aria-hidden
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(19,46,87,0.45)',
          }}
        />
      )}

      <main style={{
        flex: 1,
        overflowY: 'auto',
        // Wide tables are everywhere in this app and can't all be reflowed yet.
        // Letting the content pane scroll sideways keeps them reachable instead
        // of bleeding out and breaking the whole page width.
        overflowX: compact ? 'auto' : 'visible',
        position: 'relative',
        minWidth: 0,
        background: '#EDF0F3',
      }}>
        {/* Re-open button, shown whenever the sidebar is out of view */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            aria-label="Open menu"
            style={{
              position:       compact ? 'fixed' : 'absolute',
              top:            12,
              left:           12,
              zIndex:         30,
              // Fingers need a bigger target than a mouse pointer does.
              width:          compact ? 40 : 32,
              height:         compact ? 40 : 32,
              borderRadius:   8,
              background:     '#EDF0F3',
              border:         '1px solid #E0DDD5',
              color:          '#132E57',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              transition:     'background .2s, color .2s',
              boxShadow:      '0 1px 4px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1E8496'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#EDF0F3'; e.currentTarget.style.color = '#132E57' }}
          >
            {compact ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        )}

        {children}
      </main>

      {/* Sits above every page, so one control refreshes whichever is showing. */}
      <RefreshButton compact={compact} />
    </div>
  )
}
