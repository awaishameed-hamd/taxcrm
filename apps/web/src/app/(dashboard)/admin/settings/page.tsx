'use client'

import { useState } from 'react'
import ProfileFormSettings              from '@/components/settings/ProfileFormSettings'
import AttendanceSettings               from '@/components/settings/AttendanceSettings'
import AttendanceApplicabilitySettings  from '@/components/settings/AttendanceApplicabilitySettings'
import TaxReturnSettings                from '@/components/settings/TaxReturnSettings'
import RoleAccessSettings               from '@/components/settings/RoleAccessSettings'
import FbrNoticeSectionSettings         from '@/components/settings/FbrNoticeSectionSettings'

const NAVY      = '#132E57'
const TEAL      = '#1E8496'
const BG_ACTIVE = '#E8EEF7'
const TEAL_DIM  = 'rgba(30,132,150,0.12)'
const SLATE     = '#64748B'
const ICON_MUTED = '#94A3B8'
const BORDER    = '#E2E8F0'
const BG_SIDE   = '#E8EAED'

// Top-level nav items
const TOP_TABS = [
  {
    key: 'profile-form', label: 'Profile Form',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
  },
  {
    key: 'access-control', label: 'Access Control',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />,
  },
  {
    key: 'fbr-notice-sections', label: 'FBR Notice Sections',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />,
  },
]

// Attendance sub-tabs
const ATT_SUB = [
  { key: 'attendance-time',  label: 'Attendance Time',  color: TEAL },
  { key: 'attendance-apply', label: 'Applicability',    color: '#7B2D8E' },
]

const ATT_PARENT_KEY = 'attendance'

// Tax Return sub-tabs
const TAX_SUB = [
  { key: 'tax-sales',  label: 'Sales Tax',      apiType: 'SALES_TAX',  color: '#1E8496' },
  { key: 'tax-income', label: 'Income Tax',      apiType: 'INCOME_TAX', color: '#7B2D8E' },
  { key: 'tax-wht',    label: 'Withholding Tax', apiType: 'WHT',        color: '#C25A1F' },
]

const TAX_PARENT_KEY = 'tax-return'

export default function SettingsPage() {
  const [activeTab,     setActiveTab]     = useState<string>('profile-form')
  const [collapsed,     setCollapsed]     = useState(false)
  const [taxExpanded,   setTaxExpanded]   = useState(false)
  const [attExpanded,   setAttExpanded]   = useState(false)

  const isTaxTab   = activeTab.startsWith('tax-')
  const isAttTab   = activeTab.startsWith('attendance-')
  const activeTaxSub = TAX_SUB.find(t => t.key === activeTab)
  const activeAttSub = ATT_SUB.find(t => t.key === activeTab)
  const activeLabel = isTaxTab
    ? 'Tax Return Settings'
    : isAttTab
      ? 'Attendance Settings'
      : (TOP_TABS.find(t => t.key === activeTab)?.label ?? '')

  const selectTop = (key: string) => {
    setActiveTab(key)
    if (key !== TAX_PARENT_KEY) setTaxExpanded(false)
    if (key !== ATT_PARENT_KEY) setAttExpanded(false)
  }

  const selectTax = (key: string) => { setActiveTab(key) }
  const selectAtt = (key: string) => { setActiveTab(key) }

  const toggleTax = () => {
    setTaxExpanded(e => !e)
    if (!taxExpanded && !isTaxTab) setActiveTab('tax-sales')
  }

  const toggleAtt = () => {
    setAttExpanded(e => !e)
    if (!attExpanded && !isAttTab) setActiveTab('attendance-time')
  }

  const NavBtn = ({ tabKey, label, iconPath, depth = 0 }: { tabKey: string; label: string; iconPath?: React.ReactNode; depth?: number }) => {
    const isActive = activeTab === tabKey
    return (
      <button onClick={() => depth === 0 ? selectTop(tabKey) : selectTax(tabKey)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: depth === 0 ? '0.3rem 0.75rem' : '0.3rem 0.75rem 0.3rem 42px',
          borderRadius: 8, border: 'none',
          borderLeft: isActive ? `3px solid ${TEAL}` : '3px solid transparent',
          cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: depth === 0 ? 16 : 14,
          fontWeight: 600, letterSpacing: '0.03em',
          transition: 'background .15s, color .15s',
          background: isActive ? BG_ACTIVE : 'transparent',
          color: isActive ? NAVY : SLATE,
        }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = TEAL_DIM; e.currentTarget.style.color = NAVY } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SLATE } }}>
        {iconPath && (
          <span style={{ flexShrink: 0 }}>
            <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isActive ? TEAL : ICON_MUTED}>
              {iconPath}
            </svg>
          </span>
        )}
        {label}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh', background: '#EDF0F3' }}>

      {/* ── Settings sidebar ── */}
      <div style={{
        width: collapsed ? 0 : 260, flexShrink: 0, overflow: 'hidden',
        background: BG_SIDE, borderRight: `1px solid ${BORDER}`,
        display: 'flex', flexDirection: 'column',
        transition: 'width .25s',
      }}>
        <div style={{ minWidth: 260 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 52, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <span style={{ fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496', whiteSpace: 'nowrap' }}>
              Settings
            </span>
            <button onClick={() => setCollapsed(true)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: ICON_MUTED, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = TEAL_DIM }}
              onMouseLeave={e => { e.currentTarget.style.color = ICON_MUTED; e.currentTarget.style.background = 'transparent' }}>
              <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Nav */}
          <nav style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Regular tabs */}
            {TOP_TABS.map(tab => (
              <NavBtn key={tab.key} tabKey={tab.key} label={tab.label} iconPath={tab.icon} />
            ))}

            {/* Attendance Settings, collapsible parent */}
            <button onClick={toggleAtt}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.3rem 0.75rem', borderRadius: 8, border: 'none',
                borderLeft: isAttTab ? `3px solid ${TEAL}` : '3px solid transparent',
                cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
                fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: '0.03em',
                transition: 'background .15s, color .15s',
                background: isAttTab ? BG_ACTIVE : 'transparent',
                color: isAttTab ? NAVY : SLATE,
              }}
              onMouseEnter={e => { if (!isAttTab) { e.currentTarget.style.background = TEAL_DIM; e.currentTarget.style.color = NAVY } }}
              onMouseLeave={e => { if (!isAttTab) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SLATE } }}>
              <span style={{ flexShrink: 0 }}>
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isAttTab ? TEAL : ICON_MUTED}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <span style={{ flex: 1 }}>Attendance Settings</span>
              <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ transition: 'transform .2s', transform: attExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Attendance sub-items */}
            {attExpanded && (
              <div style={{ overflow: 'hidden' }}>
                {ATT_SUB.map(sub => {
                  const isActive = activeTab === sub.key
                  return (
                    <button key={sub.key} onClick={() => selectAtt(sub.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '0.3rem 0.75rem 0.3rem 40px', borderRadius: 8, border: 'none',
                        borderLeft: isActive ? `3px solid ${sub.color}` : '3px solid transparent',
                        cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
                        fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: '0.03em',
                        transition: 'background .15s, color .15s',
                        background: isActive ? BG_ACTIVE : 'transparent',
                        color: isActive ? sub.color : SLATE,
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = TEAL_DIM; e.currentTarget.style.color = NAVY } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SLATE } }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sub.color, flexShrink: 0 }} />
                      {sub.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tax Return Settings, collapsible parent */}
            <button onClick={toggleTax}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.3rem 0.75rem', borderRadius: 8, border: 'none',
                borderLeft: isTaxTab ? `3px solid ${TEAL}` : '3px solid transparent',
                cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
                fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: '0.03em',
                transition: 'background .15s, color .15s',
                background: isTaxTab ? BG_ACTIVE : 'transparent',
                color: isTaxTab ? NAVY : SLATE,
              }}
              onMouseEnter={e => { if (!isTaxTab) { e.currentTarget.style.background = TEAL_DIM; e.currentTarget.style.color = NAVY } }}
              onMouseLeave={e => { if (!isTaxTab) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SLATE } }}>
              <span style={{ flexShrink: 0 }}>
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isTaxTab ? TEAL : ICON_MUTED}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <span style={{ flex: 1 }}>Tax Return Settings</span>
              {/* Chevron */}
              <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ transition: 'transform .2s', transform: taxExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Tax sub-items */}
            {taxExpanded && (
              <div style={{ overflow: 'hidden', transition: 'max-height .25s' }}>
                {TAX_SUB.map(sub => {
                  const isActive = activeTab === sub.key
                  return (
                    <button key={sub.key} onClick={() => selectTax(sub.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '0.3rem 0.75rem 0.3rem 40px', borderRadius: 8, border: 'none',
                        borderLeft: isActive ? `3px solid ${sub.color}` : '3px solid transparent',
                        cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
                        fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: '0.03em',
                        transition: 'background .15s, color .15s',
                        background: isActive ? BG_ACTIVE : 'transparent',
                        color: isActive ? sub.color : SLATE,
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = TEAL_DIM; e.currentTarget.style.color = NAVY } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SLATE } }}>
                      {/* Color dot */}
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sub.color, flexShrink: 0 }} />
                      {sub.label}
                    </button>
                  )
                })}
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Collapsed toggle */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)}
          style={{ position: 'fixed', left: 256, top: '50%', transform: 'translateY(-50%)', zIndex: 100, width: 22, height: 44, background: BG_SIDE, border: `1px solid ${BORDER}`, borderLeft: 'none', borderRadius: '0 8px 8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ICON_MUTED, boxShadow: '2px 0 8px rgba(0,0,0,0.06)' }}
          onMouseEnter={e => { e.currentTarget.style.color = NAVY }}
          onMouseLeave={e => { e.currentTarget.style.color = ICON_MUTED }}>
          <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
        <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
            {activeLabel}
          </h1>
          {(activeTaxSub || activeAttSub) && (
            <span style={{ fontSize: 12, fontWeight: 600, color: (activeTaxSub ?? activeAttSub)!.color, background: '#F3F4F6', padding: '3px 12px', borderRadius: 20, fontFamily: "'Aptos', sans-serif" }}>
              {(activeTaxSub ?? activeAttSub)!.label}
            </span>
          )}
        </div>

        {activeTab === 'profile-form'          && <ProfileFormSettings />}
        {activeTab === 'access-control'        && <RoleAccessSettings />}
        {activeTab === 'attendance-time'       && <AttendanceSettings />}
        {activeTab === 'attendance-apply'      && <AttendanceApplicabilitySettings />}
        {activeTab === 'fbr-notice-sections'   && <FbrNoticeSectionSettings />}
        {isTaxTab && activeTaxSub && (
          <TaxReturnSettings key={activeTaxSub.apiType} initialType={activeTaxSub.apiType} />
        )}
      </div>

    </div>
  )
}
