'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import { useIdleLogout } from '@/hooks/useIdleLogout'

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

  useIdleLogout()

  const collapsed   = sidebarCollapsed         !== undefined ? sidebarCollapsed         : internalCollapsed
  const setCollapsed = onSidebarCollapsedChange !== undefined ? onSidebarCollapsedChange : setInternalCollapsed

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EDF0F3' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <main style={{ flex: 1, overflowY: 'auto', position: 'relative', minWidth: 0, background: '#EDF0F3' }}>
        {/* Re-open button — shown only when sidebar is collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            style={{
              position:       'absolute',
              top:            12,
              left:           12,
              zIndex:         30,
              width:          32,
              height:         32,
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
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
              stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {children}
      </main>
    </div>
  )
}
