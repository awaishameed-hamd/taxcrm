'use client'

import { useEffect, useState } from 'react'
import { formatDate, getStatusLabel, STATUS_BADGE_CLASSES, TaxReturnStatus } from '@/lib/utils'
import StatusBadge from '@/components/ui/StatusBadge'
import api from '@/lib/api'

const STATUS_STEPS = [
  TaxReturnStatus.DATA_AWAITED,
  TaxReturnStatus.DATA_RECEIVED,
  TaxReturnStatus.IN_PROGRESS,
  TaxReturnStatus.UNDER_REVIEW,
  TaxReturnStatus.PSID_GENERATED,
  TaxReturnStatus.PAYMENT_RECEIVED,
  TaxReturnStatus.COMPLETED,
]

function StatusTracker({ status }: { status: TaxReturnStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(status)

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STATUS_STEPS.map((step, idx) => {
        const done    = idx < currentIdx
        const active  = idx === currentIdx
        const pending = idx > currentIdx

        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done   ? 'bg-emerald-500 text-white' :
                active ? 'bg-[#1E8496] text-white ring-4 ring-[#1E8496]/20' :
                         'bg-gray-100 text-gray-400'
              }`}>
                {done ? '✓' : idx + 1}
              </div>
              <span className={`text-[9px] font-semibold text-center max-w-[60px] leading-tight ${
                active ? 'text-[#1E8496]' : done ? 'text-emerald-600' : 'text-gray-400'
              }`}>
                {getStatusLabel(step)}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 w-6 flex-shrink-0 mb-4 transition-all ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ClientDashboard() {
  const [stats,   setStats]   = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats').then(({ data }) => setStats(data.data)).finally(() => setLoading(false))
  }, [])

  const returns: any[] = stats?.recentReturns ?? []
  const active = returns.find((r: any) => r.status !== TaxReturnStatus.COMPLETED)

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-[#132E57]" style={{ fontFamily: '"Aptos", sans-serif' }}>
          My Tax Returns
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Track your filing status in real time</p>
      </div>

      {/* Active return tracker */}
      {active && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-700">Current Filing</h2>
              <p className="text-xs text-gray-400 mt-0.5">{active.returnType.replace('_',' ')} · {active.taxYear}</p>
            </div>
            <StatusBadge status={active.status} />
          </div>
          <StatusTracker status={active.status} />
        </div>
      )}

      {/* All returns */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700">All Returns ({returns.length})</h2>
        </div>
        {loading && <div className="p-6 text-center text-sm text-gray-400">Loading…</div>}
        {!loading && returns.length === 0 && (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">No tax returns yet</p>
        )}
        <div className="divide-y divide-gray-50">
          {returns.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-gray-800">{r.returnType.replace('_',' ')} · {r.taxYear}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Handler: {r.assignedTo?.fullName ?? 'Being assigned'} · {formatDate(r.createdAt)}
                </p>
              </div>
              <StatusBadge status={r.status as TaxReturnStatus} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
