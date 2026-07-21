'use client'

import { useState } from 'react'
import ProfileFormSettings  from '@/components/settings/ProfileFormSettings'
import ClientFormSettings   from '@/components/settings/ClientFormSettings'
import AttendanceSettings   from '@/components/settings/AttendanceSettings'
import RoleAccessSettings   from '@/components/settings/RoleAccessSettings'

const NAVY = '#132E57'
const TEAL = '#1E8496'

const TABS = [
  { key: 'profile-form',    label: 'Profile Form'    },
  { key: 'client-form',     label: 'Client Form'     },
  { key: 'attendance-time', label: 'Attendance Time' },
  { key: 'access-control',  label: 'Access Control'  },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string>('profile-form')

  return (
    <div style={{ padding: '0 20px 20px', minHeight: '100vh', background: '#EDF0F3' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496' }}>
          Settings
        </h1>
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-xl"
        style={{ background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', display: 'inline-flex' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="px-5 py-2 rounded-lg text-sm font-bold transition-all duration-150 focus:outline-none"
              style={{
                fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em',
                background: isActive ? `linear-gradient(90deg, ${NAVY}, ${TEAL})` : 'transparent',
                color: isActive ? '#FFFFFF' : '#64748B',
                boxShadow: isActive ? '0 2px 8px rgba(30,132,150,0.2)' : 'none',
                border: 'none', cursor: 'pointer',
              }}>
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'profile-form'    && <ProfileFormSettings />}
      {activeTab === 'client-form'     && <ClientFormSettings />}
      {activeTab === 'attendance-time' && <AttendanceSettings />}
      {activeTab === 'access-control'  && <RoleAccessSettings />}
    </div>
  )
}
