'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'

// The one table every list in the CRM renders through: gold header, compact
// striped rows, columns the user can drag wider, and cells that wrap instead of
// clipping. Widths are remembered per table id, so a column dragged on Clients
// stays dragged on the next visit without each page wiring up its own storage.

export interface Column<T> {
  key: string
  label: string
  width?: number
  align?: 'left' | 'right' | 'center'
  // Wrap long text onto more lines rather than cutting it off with an ellipsis.
  wrap?: boolean
  render?: (row: T, index: number) => React.ReactNode
  cellStyle?: React.CSSProperties
  headerStyle?: React.CSSProperties
  resizable?: boolean
}

const lsGet = (k: string): Record<string, number> | null => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null }
}
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }

export default function DataTable<T>({
  id, columns, rows, loading, emptyText = 'Nothing to show.', rowKey,
  onRowClick, rowStyle, minWidth, skeletonRows = 6, stickyHeader, footer, containerStyle,
}: {
  // Storage key for this table's column widths. Leave it out to skip persisting.
  id?: string
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  emptyText?: React.ReactNode
  rowKey: (row: T, index: number) => string
  onRowClick?: (row: T, index: number) => void
  rowStyle?: (row: T, index: number) => React.CSSProperties | undefined
  minWidth?: number
  skeletonRows?: number
  stickyHeader?: boolean
  footer?: React.ReactNode
  // For a table that already sits inside a card or a scroll pane, so it can drop
  // the border and let the parent own the scrolling.
  containerStyle?: React.CSSProperties
}) {
  const defaults = useCallback(
    () => Object.fromEntries(columns.map(c => [c.key, c.width ?? 140])) as Record<string, number>,
    [columns],
  )

  const [widths, setWidths] = useState<Record<string, number>>(defaults)
  const [hydrated, setHydrated] = useState(false)

  // Stored widths are read after mount so the server and client first paint match
  useEffect(() => {
    const saved = id ? lsGet(`dt:${id}:widths`) : null
    setWidths(saved ? { ...defaults(), ...saved } : defaults())
    setHydrated(true)
  }, [id, defaults])

  useEffect(() => { if (hydrated && id) lsSet(`dt:${id}:widths`, widths) }, [widths, hydrated, id])

  const dragging = useRef<{ key: string; startX: number; startW: number } | null>(null)

  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = { key, startX: e.clientX, startW: widths[key] ?? 140 }
    const onMove = (ev: MouseEvent) => {
      const d = dragging.current
      if (!d) return
      setWidths(prev => ({ ...prev, [d.key]: Math.max(50, d.startW + ev.clientX - d.startX) }))
    }
    const onUp = () => {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widths])

  const th: React.CSSProperties = {
    padding: '6px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    textTransform: 'uppercase', color: '#1a1a1a', fontFamily: "'Aptos', sans-serif",
    letterSpacing: '0.07em', whiteSpace: 'nowrap', position: 'relative',
    userSelect: 'none', overflow: 'hidden',
  }
  const tdBase: React.CSSProperties = {
    padding: '6px 14px', fontSize: 13, fontFamily: "'Aptos', sans-serif",
    color: '#1a1a1a', borderBottom: `1px solid ${P.border}50`,
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflowX: 'auto', ...containerStyle }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
        <colgroup>
          {columns.map(c => <col key={c.key} style={{ width: widths[c.key] ?? c.width ?? 140 }} />)}
        </colgroup>
        <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 10 } : undefined}>
          <tr style={{ background: '#F2AC18' }}>
            {columns.map(c => (
              <th key={c.key} style={{ ...th, textAlign: c.align ?? 'left', ...c.headerStyle }}>
                {c.label}
                {c.resizable !== false && (
                  <span onMouseDown={e => onResizeStart(c.key, e)} style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                    cursor: 'col-resize', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1,
                  }}>
                    <span style={{ width: 2, height: '55%', background: 'rgba(0,0,0,0.2)', borderRadius: 2 }} />
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFC' }}>
                {columns.map(c => (
                  <td key={c.key} style={tdBase}>
                    <div style={{ height: 12, borderRadius: 4, background: P.gridLine }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '48px 16px', textAlign: 'center', color: P.textMuted, fontFamily: "'Aptos', sans-serif" }}>
                {emptyText}
              </td>
            </tr>
          ) : rows.map((row, idx) => (
            <tr key={rowKey(row, idx)}
              onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
              style={{
                background: idx % 2 === 0 ? '#fff' : '#FAFCFC',
                cursor: onRowClick ? 'pointer' : undefined,
                ...rowStyle?.(row, idx),
              }}>
              {columns.map(c => (
                <td key={c.key} style={{
                  ...tdBase,
                  textAlign: c.align ?? 'left',
                  // Wrapping columns break long words so a narrow drag cannot push
                  // content past the cell; the rest stay on one line and ellipsis.
                  ...(c.wrap
                    ? { whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.5 }
                    : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                  ...c.cellStyle,
                }}>
                  {c.render ? c.render(row, idx) : String((row as any)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  )
}
