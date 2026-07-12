'use client'
import { useState, useRef, useEffect } from 'react'

const NAVY = '#132E57'
const TEAL = '#1E8496'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: "'Aptos', sans-serif",
  outline: 'none', color: NAVY, background: '#fff',
}

export default function StyledSelect({ value, onChange, options, placeholder, loading, borderColor, disabled }: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  loading?: boolean
  borderColor?: string
  disabled?: boolean
}) {
  const [query,   setQuery]   = useState('')
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected   = options.find(o => o.value === value)
  const displayVal = focused ? query : (selected?.label ?? '')

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setFocused(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (opt: { value: string; label: string }) => {
    onChange(opt.value)
    setQuery(''); setOpen(false); setFocused(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={displayVal}
          onChange={e => { if (!disabled) { setQuery(e.target.value); setOpen(true) } }}
          onFocus={() => { if (!disabled) { setFocused(true); setQuery(''); setOpen(true) } }}
          placeholder={loading ? 'Loading…' : (placeholder ?? 'Select…')}
          readOnly={loading || disabled}
          disabled={disabled}
          style={{ ...inputStyle, borderColor: borderColor ?? '#E0DDD5', paddingRight: 30, cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'text', background: disabled ? '#F9FAFB' : '#fff', color: disabled ? '#9CA3AF' : NAVY }}
        />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#808080' }}>
          <svg width={13} height={13} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </span>
      </div>

      {open && !loading && !disabled && (
        <div style={{
          position: 'absolute', zIndex: 999, top: 'calc(100% + 3px)', left: 0, right: 0,
          background: '#fff', border: '1.5px solid #E0DDD5', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#808080', fontFamily: "'Aptos',sans-serif" }}>No results</div>
          ) : filtered.map(opt => (
            <div key={opt.value} onMouseDown={() => handleSelect(opt)}
              style={{
                padding: '9px 14px', fontSize: 13, fontFamily: "'Aptos',sans-serif", cursor: 'pointer',
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
