'use client'

import { useRef, useState } from 'react'
import api from '@/lib/api'

const NAVY = '#132E57'
const TEAL = '#1E8496'
const GOLD = 'F2AC18'
const F    = "'Aptos', sans-serif"

export interface ImportColumn {
  key: string        // matches the field the backend expects on each row
  header: string     // column heading shown in the template
  example?: string   // sample value written into the first data row
  required?: boolean
  width?: number
  options?: string[] // when set, the column becomes a locked dropdown in Excel
}

// How many data rows get the dropdown validation applied. Comfortably above a
// 200-row import while keeping the file small.
const VALIDATION_ROWS = 600

// A1-style column letter from a 1-based index.
function colLetter(n: number): string {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

interface Props {
  title: string
  sheetName: string
  fileName: string        // template download filename, without extension
  columns: ImportColumn[]
  endpoint: string        // e.g. '/clients/bulk'
  note?: string           // short guidance shown under the heading
  onClose: () => void
  onDone: () => void      // called after a successful import so the list refetches
}

type Result = { total: number; created: number; failedCount: number; failed: { row: number; name: string; error: string }[] }

export default function BulkImportModal({ title, sheetName, fileName, columns, endpoint, note, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [fileLabel, setFileLabel] = useState('')

  async function downloadTemplate() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Asif Associates'
    const ws = wb.addWorksheet(sheetName)

    ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 20 }))

    // Gold header row, matching the app's table style. Required columns get a *.
    const head = ws.getRow(1)
    head.height = 22
    head.eachCell((cell, i) => {
      const col = columns[i - 1]
      cell.value = col?.required ? `${col.header} *` : col?.header ?? cell.value
      cell.font = { bold: true, color: { argb: 'FF132E57' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GOLD}` } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFA23A' } } }
    })

    // One example row so the format is obvious.
    ws.addRow(Object.fromEntries(columns.map(c => [c.key, c.example ?? ''])))
    ws.getRow(2).font = { italic: true, color: { argb: 'FF94A3B8' } }

    // Dropdown validation. Option lists live on a hidden sheet and are referenced
    // by range, which avoids Excel's 255-char limit on inline lists (the staff
    // list can be long) and keeps the picker clean.
    const withOpts = columns.map((c, i) => ({ c, i })).filter(x => x.c.options && x.c.options.length)
    if (withOpts.length) {
      const lists = wb.addWorksheet('Lists', { state: 'veryHidden' })
      withOpts.forEach(({ c }, listIdx) => {
        const letter = colLetter(listIdx + 1)
        c.options!.forEach((opt, r) => { lists.getCell(`${letter}${r + 1}`).value = opt })
        const ref = `Lists!$${letter}$1:$${letter}$${c.options!.length}`
        const colLtr = colLetter(columns.indexOf(c) + 1)
        for (let row = 2; row <= VALIDATION_ROWS; row++) {
          ws.getCell(`${colLtr}${row}`).dataValidation = {
            type: 'list',
            allowBlank: true,          // blank is always allowed
            formulae: [ref],
            showErrorMessage: true,
            errorStyle: 'stop',        // reject anything not on the list
            errorTitle: 'Pick from the list',
            error: `Choose one of the allowed values for "${c.header}".`,
          }
        }
      })
    }

    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${fileName}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setResult(null); setFileLabel(file.name); setBusy(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) throw new Error('That file has no sheets.')

      // Map the header row back to our column keys by matching the header text,
      // so the order of columns in the sheet does not matter.
      const headerRow = ws.getRow(1)
      const colKeyByIndex: Record<number, string> = {}
      headerRow.eachCell((cell, idx) => {
        // Strip the required-marker asterisk before matching.
        const text = String(cell.value ?? '').replace(/\*+\s*$/, '').trim().toLowerCase()
        const col = columns.find(c => c.header.toLowerCase() === text)
        if (col) colKeyByIndex[idx] = col.key
      })
      if (Object.keys(colKeyByIndex).length === 0) {
        throw new Error('The headings do not match the template. Please download a fresh template.')
      }

      const rows: any[] = []
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const obj: any = {}
        let hasValue = false
        Object.entries(colKeyByIndex).forEach(([idx, key]) => {
          const v = row.getCell(Number(idx)).value
          let val: any = v && typeof v === 'object' && 'text' in (v as any) ? (v as any).text : v
          // A date cell must reach the API as YYYY-MM-DD, not a JS date string.
          if (val instanceof Date) val = val.toISOString().split('T')[0]
          const s = val === null || val === undefined ? '' : String(val).trim()
          obj[key] = s
          if (s) hasValue = true
        })
        if (hasValue) rows.push(obj)
      })

      if (rows.length === 0) throw new Error('No data rows found. Fill the template below the headings.')

      const { data } = await api.post(endpoint, { rows })
      setResult(data?.data ?? data)
      onDone()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(19,46,87,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px -12px rgba(19,46,87,0.4)', fontFamily: F, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ background: TEAL, color: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Faster One', cursive", fontSize: 22 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {note && <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>{note}</p>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button onClick={downloadTemplate}
              style={{ flex: 1, minWidth: 200, padding: '11px 16px', borderRadius: 10, border: `1.5px solid ${TEAL}`, background: '#fff', color: TEAL, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              1. Download template
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ flex: 1, minWidth: 200, padding: '11px 16px', borderRadius: 10, border: 'none', background: busy ? '#94A3B8' : NAVY, color: '#fff', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              {busy ? 'Importing…' : '2. Upload filled file'}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} style={{ display: 'none' }} />
          </div>

          {fileLabel && !busy && !error && !result && (
            <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 8px' }}>Selected: {fileLabel}</p>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#B91C1C', fontSize: 13 }}>{error}</div>
          )}

          {result && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: result.failedCount ? 14 : 0 }}>
                <div style={{ flex: 1, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{result.created}</div>
                  <div style={{ fontSize: 11, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Imported</div>
                </div>
                <div style={{ flex: 1, background: result.failedCount ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${result.failedCount ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: result.failedCount ? '#DC2626' : '#94A3B8' }}>{result.failedCount}</div>
                  <div style={{ fontSize: 11, color: result.failedCount ? '#B91C1C' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Skipped</div>
                </div>
              </div>

              {result.failedCount > 0 && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ background: '#F8FAFC', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rows skipped, fix and re-import just these</div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {result.failed.map((f, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', borderTop: '1px solid #F1F5F9', fontSize: 12.5 }}>
                        <span style={{ color: '#94A3B8', flexShrink: 0 }}>Row {f.row}</span>
                        <span style={{ color: NAVY, fontWeight: 600, flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(blank)'}</span>
                        <span style={{ color: '#DC2626' }}>{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: result ? TEAL : '#F1F5F9', color: result ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F }}>
            {result ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
