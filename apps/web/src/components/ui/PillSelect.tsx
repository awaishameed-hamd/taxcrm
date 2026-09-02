'use client'
import { useState, useRef, useEffect } from 'react'

const NAVY = '#132E57'
const TEAL = '#1E8496'

// A dropdown whose trigger is a navy pill, to sit inside the teal filter bars
// next to the Active/Inactive pills. The open list matches StyledSelect.
export default function PillSelect({ value, onChange, options, minWidth = 150, dimValue }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  minWidth?: number
  // When the current value equals this (e.g. the "all" default), the pill dims
  // to translucent, so an applied filter reads as navy and an unset one does not.
  dimValue?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const sel = options.find(o => o.value === value) ?? options[0]

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 40,
          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          fontFamily: "'Aptos', sans-serif", color: '#fff', whiteSpace: 'nowrap',
          background: dimValue !== undefined && value === dimValue ? 'rgba(255,255,255,0.18)' : NAVY,
        }}>
        {sel?.label}
        <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 999, top: 'calc(100% + 5px)', left: 0, minWidth,
          background: '#fff', border: '1.5px solid #E0DDD5', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {options.map(opt => (
            <div key={opt.value} onMouseDown={() => { onChange(opt.value); setOpen(false) }}
              style={{
                padding: '5px 12px', fontSize: 13, fontFamily: "'Aptos', sans-serif", cursor: 'pointer',
                color: opt.value === value ? TEAL : NAVY,
                fontWeight: opt.value === value ? 700 : 400,
                background: opt.value === value ? '#E5F3F5' : 'transparent',
                borderBottom: '1px solid #F0EDE5',
              }}
              onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = '#f7f8fa' }}
              onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >{opt.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}
