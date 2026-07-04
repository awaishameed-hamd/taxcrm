'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDate } from '@/lib/utils'
import api from '@/lib/api'
import { P } from '@/lib/palette'

const PERIODS = [
  { key: 'overall', label: 'Overall'     },
  { key: 'daily',   label: 'Today'       },
  { key: 'weekly',  label: 'This Week'   },
  { key: 'monthly', label: 'This Month'  },
]

interface StatCardProps {
  label: string
  value: number
  border: string
  fill: string
  textColor: string
}

function StatCard({ label, value, border, fill, textColor }: StatCardProps) {
  return (
    <div style={{
      background:   fill,
      borderLeft:   `4px solid ${border}`,
      borderRadius: 10,
      padding:      '14px 16px',
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.textMuted }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 30, fontWeight: 900, color: textColor, fontFamily: '"Aptos", sans-serif' }}>
        {value}
      </p>
    </div>
  )
}

interface Props { title: string; subtitle: string }

export default function DashboardPage({ title, subtitle }: Props) {
  const [period, setPeriod]   = useState('overall')
  const [stats, setStats]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = period === 'overall' ? {} : { period }
      const { data } = await api.get('/dashboard/stats', { params })
      setStats(data.data)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '0 20px 20px', minHeight: '100vh', background: P.bgMain }}>

      {/* Header + period tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, height: 52, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontFamily: "'Ethnocentric Rg', sans-serif", fontWeight: 300, fontSize: 18, color: P.navy, margin: 0 }}>
            {title}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{
                background: period === p.key ? P.navy : 'transparent',
                color:      period === p.key ? '#fff' : P.slate,
                border: 'none', padding: '6px 14px', borderRadius: 6,
                fontSize: 12, fontWeight: period === p.key ? 700 : 500,
                fontFamily: '"Aptos", sans-serif', letterSpacing: '0.03em',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard content placeholder */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, padding: '32px 16px', textAlign: 'center' }}>
        <p style={{ color: P.textMuted, fontSize: 13, margin: 0 }}>Dashboard widgets coming soon.</p>
      </div>
    </div>
  )
}
