'use client'
import { useState, useRef, useEffect } from 'react'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const F    = "'Aptos', sans-serif"

// Same box as StyledSelect, so a multiple choice reads as the same control as a
// single one everywhere in the CRM.
const boxStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 30px 6px 8px', borderRadius: 8,
  border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: F,
  outline: 'none', color: NAVY, background: '#fff', cursor: 'pointer',
  minHeight: 38, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5,
}

// Several picks from one dropdown. What is chosen sits in the box as chips that
// can be taken off again, and the list stays open while picking so a team can
// be put together in one go rather than reopening per person.
export default function MultiSelect({ values, onChange, options, placeholder, loading, emptyText, disabled }: {
  values: string[]
  onChange: (vals: string[]) => void
  options: { value: string; label: string; hint?: string }[]
  placeholder?: string
  loading?: boolean
  emptyText?: string
  disabled?: boolean
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Inside a scrolling panel, such as the New Task modal, a list opening near
  // the bottom would otherwise be cut off by the panel's own edge.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => wrapRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10)
    return () => clearTimeout(t)
  }, [open])

  const chosen = options.filter(o => values.includes(o.value))
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div onClick={() => { if (!disabled && !loading) setOpen(o => !o) }}
        style={{ ...boxStyle, background: disabled ? '#F9FAFB' : '#fff', cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'pointer', position: 'relative' }}>
        {chosen.length === 0 && (
          <span style={{ color: '#9CA3AF', fontSize: 13, paddingLeft: 4 }}>
            {loading ? 'Loading…' : (placeholder ?? 'Select…')}
          </span>
        )}
        {chosen.map(o => (
          <span key={o.value} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: '#E8EEF7', border: `1px solid ${TEAL}`, color: TEAL,
            borderRadius: 7, padding: '2px 7px', fontSize: 12, fontWeight: 600, fontFamily: F,
          }}>
            {o.label}
            <span role="button" aria-label={'Remove ' + o.label}
              onClick={e => { e.stopPropagation(); toggle(o.value) }}
              style={{ cursor: 'pointer', color: '#64748B', fontWeight: 700, lineHeight: 1, fontSize: 13 }}>
              x
            </span>
          </span>
        ))}
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
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {options.length > 6 && (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 12px', border: 'none', borderBottom: '1px solid #F0EDE5', fontSize: 13, fontFamily: F, outline: 'none', color: NAVY }} />
          )}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#808080', fontFamily: F }}>
                {options.length === 0 ? (emptyText ?? 'Nothing to choose from') : 'No results'}
              </div>
            ) : filtered.map(o => {
              const on = values.includes(o.value)
              return (
                <label key={o.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 12px', fontSize: 13, fontFamily: F, cursor: 'pointer',
                    color: on ? TEAL : NAVY, fontWeight: on ? 700 : 400,
                    background: on ? '#E5F3F5' : 'transparent',
                    borderBottom: '1px solid #F0EDE5',
                  }}
                  onMouseEnter={e => { if (!on) (e.currentTarget as HTMLElement).style.background = '#f7f8fa' }}
                  onMouseLeave={e => { if (!on) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(o.value)}
                    style={{ accentColor: TEAL, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {o.hint && <span style={{ color: '#94A3B8', fontWeight: 500, fontSize: 12, flexShrink: 0 }}>{o.hint}</span>}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
