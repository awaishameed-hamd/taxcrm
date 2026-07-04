'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type ExcelJS from 'exceljs'
import { P } from '@/lib/palette'
import api from '@/lib/api'
import StyledSelect from '@/components/ui/StyledSelect'

const NAVY = '#132E57'
const TEAL = '#1E8496'

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_ST_COLS   = 'crm_tax_summary_visible_cols'
const LS_ST_WIDTHS = 'crm_tax_summary_col_widths'
function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

const TAX_TABS = [
  { key: 'sales_tax',  label: 'Sales Tax',      color: '#1E8496' },
  { key: 'income_tax', label: 'Income Tax',      color: '#C25A1F' },
]

const AUTHORITIES = ['FBR', 'PRA', 'SRB', 'KPRA', 'BRA', 'AJK']

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

async function exportSalesTaxExcel(returns: any[], clientName: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CA Firm CRM'
  const ws = wb.addWorksheet('Sales Tax Summary')

  const NAVY_HEX  = '132E57'
  const GOLD_HEX  = 'F2AC18'
  const TEAL_HEX  = '1E8496'
  const LIGHT_GOLD = 'FEF3C7'

  const cols = [
    { header: 'Month & Year',                     key: 'month',                 width: 14 },
    { header: 'Authority',                         key: 'authority',             width: 12 },
    { header: 'Type',                              key: 'type',                  width: 12 },
    { header: 'Standard Sales (excl. tax)',        key: 'standardSales',         width: 22 },
    { header: 'Output Tax on Standard Sales',      key: 'outputTaxStandard',     width: 24 },
    { header: 'Reduced Rate Sales (excl. tax)',    key: 'reducedRateSales',      width: 24 },
    { header: 'Output Tax on Reduced Rate',        key: 'outputTaxReduced',      width: 24 },
    { header: 'Exempt Sales',                      key: 'exemptSales',           width: 16 },
    { header: 'Zero Rated Sales',                  key: 'zeroRatedSales',        width: 16 },
    { header: 'Standard Purchases (excl. tax)',    key: 'standardPurchases',     width: 24 },
    { header: 'Input Tax on Standard',             key: 'inputTaxStandard',      width: 22 },
    { header: 'Reduced Rate Purchases (excl. tax)',key: 'reducedRatePurchases',  width: 28 },
    { header: 'Input Tax on Reduced Rate',         key: 'inputTaxReduced',       width: 24 },
    { header: 'Unregistered Purchases',            key: 'unregisteredPurchases', width: 22 },
    { header: 'Exempt Purchases',                  key: 'exemptPurchases',       width: 18 },
    { header: 'Zero Rated Purchases',              key: 'zeroRatedPurchases',    width: 20 },
    { header: 'Normal Tax Payable',                key: 'normalTaxPayable',      width: 18 },
    { header: 'Further Tax Payable',               key: 'furtherTaxPayable',     width: 18 },
    { header: 'Tax Carry Forward',                 key: 'taxCarryForward',       width: 18 },
  ]
  const numKeys = new Set(cols.slice(3).map(c => c.key))

  // Title row
  ws.mergeCells(1, 1, 1, cols.length)
  const titleCell = ws.getCell('A1')
  titleCell.value = `Sales Tax Summary  |  ${clientName}`
  titleCell.font  = { name: 'Aptos', bold: true, size: 14, color: { argb: 'FF' + NAVY_HEX } }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD_HEX } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  // Date row
  ws.mergeCells(2, 1, 2, cols.length)
  const dateCell = ws.getCell('A2')
  dateCell.value = `Exported: ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`
  dateCell.font  = { name: 'Aptos', size: 10, italic: true, color: { argb: 'FF' + NAVY_HEX } }
  dateCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9EC' } }
  dateCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  // Set columns
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }))

  // Header row (row 3)
  const headerRow = ws.getRow(3)
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.header
    cell.font  = { name: 'Aptos', bold: true, size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD_HEX } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + NAVY_HEX } } }
  })
  headerRow.height = 36

  // #,##0 = whole numbers with commas; if decimal exists it shows, no trailing zeros
  const numFmt = '#,##0'

  const setCell = (row: ExcelJS.Row, colIdx: number, value: ExcelJS.CellValue, isNum: boolean, bg: string, bold = false) => {
    const cell = row.getCell(colIdx)
    cell.value = value
    cell.font  = { name: 'Aptos', size: 10, bold, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.alignment = { horizontal: isNum ? 'right' : 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    if (isNum) cell.numFmt = numFmt
  }

  // Data rows
  returns.forEach((r, idx) => {
    const row = ws.addRow([])
    const bg  = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F9FA'
    const rowData: ExcelJS.CellValue[] = [
      `${MONTH_NAMES[r.periodMonth - 1]}-${String(r.periodYear).slice(2)}`,
      r.authority  ?? '',
      r.returnType ?? '',
      Number(r.standardSales         ?? 0),
      Number(r.outputTaxStandard     ?? 0),
      Number(r.reducedRateSales      ?? 0),
      Number(r.outputTaxReduced      ?? 0),
      Number(r.exemptSales           ?? 0),
      Number(r.zeroRatedSales        ?? 0),
      Number(r.standardPurchases     ?? 0),
      Number(r.inputTaxStandard      ?? 0),
      Number(r.reducedRatePurchases  ?? 0),
      Number(r.inputTaxReduced       ?? 0),
      Number(r.unregisteredPurchases ?? 0),
      Number(r.exemptPurchases       ?? 0),
      Number(r.zeroRatedPurchases    ?? 0),
      Number(r.normalTaxPayable      ?? 0),
      Number(r.furtherTaxPayable     ?? 0),
      Number(r.taxCarryForward       ?? 0),
    ]
    rowData.forEach((val, i) => setCell(row, i + 1, val, numKeys.has(cols[i].key), bg))
    row.height = 18
  })

  // Totals row
  const totalRow = ws.addRow([])
  const dataStart = 4, dataEnd = 3 + returns.length
  cols.forEach((c, i) => {
    const colLetter = ws.getColumn(i + 1).letter
    const isNum = numKeys.has(c.key)
    const cell  = totalRow.getCell(i + 1)
    if (i === 0) {
      cell.value = 'TOTAL'
    } else if (isNum) {
      cell.value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` }
      cell.numFmt = numFmt
    }
    cell.font   = { name: 'Aptos', bold: true, size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT_GOLD } }
    cell.alignment = { horizontal: isNum ? 'right' : 'center', vertical: 'middle' }
    cell.border = { top: { style: 'medium', color: { argb: 'FF' + GOLD_HEX } } }
  })
  totalRow.height = 20

  // Freeze header rows
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  const safe = clientName.replace(/[^a-z0-9]/gi, '_')
  a.download = `sales-tax-summary-${safe}-${new Date().toISOString().slice(0,10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

const ST_COLS = [
  { key: 'standardSales',         label: 'Standard sales\n(excl.tax)',              defaultWidth: 130 },
  { key: 'outputTaxStandard',     label: 'Output tax\non standard sales',            defaultWidth: 120 },
  { key: 'reducedRateSales',      label: 'Reduced rate sales\n(excl.tax)',          defaultWidth: 140 },
  { key: 'outputTaxReduced',      label: 'Output tax\non reduced rate',              defaultWidth: 120 },
  { key: 'exemptSales',           label: 'Exempt\nsales',                            defaultWidth: 100 },
  { key: 'zeroRatedSales',        label: 'Zero rated\nsales',                        defaultWidth: 100 },
  { key: 'standardPurchases',     label: 'Standard purchases\n(excl.tax)',          defaultWidth: 140 },
  { key: 'inputTaxStandard',      label: 'Input tax\non standard',                   defaultWidth: 120 },
  { key: 'reducedRatePurchases',  label: 'Reduced rate purchases\n(excl.tax)',      defaultWidth: 150 },
  { key: 'inputTaxReduced',       label: 'Input tax\non reduced rate',               defaultWidth: 120 },
  { key: 'unregisteredPurchases', label: 'Unregistered\npurchases',                  defaultWidth: 120 },
  { key: 'exemptPurchases',       label: 'Exempt\npurchases',                        defaultWidth: 100 },
  { key: 'zeroRatedPurchases',    label: 'Zero rated\npurchases',                    defaultWidth: 110 },
  { key: 'normalTaxPayable',      label: 'Normal sales tax\npayable',                defaultWidth: 130 },
  { key: 'furtherTaxPayable',     label: 'Further sales tax\npayable',               defaultWidth: 130 },
  { key: 'taxCarryForward',       label: 'Sales tax\ncarry forward',                 defaultWidth: 120 },
]

const ALL_ST_COL_KEYS = ST_COLS.map(c => c.key)

// ── Income Tax columns ────────────────────────────────────────────────────────
const LS_IT_COLS   = 'crm_income_tax_visible_cols'
const LS_IT_WIDTHS = 'crm_income_tax_col_widths'

const IT_COLS = [
  { key: 'totalProfitLoss',       label: 'Total\nProfit/Loss',                    defaultWidth: 130 },
  { key: 'profitLossExempt',      label: 'Profit/Loss\nexempt or\nfinal tax',     defaultWidth: 140 },
  { key: 'amountSubjectNormal',   label: 'Amount subject\nto normal tax',         defaultWidth: 135 },
  { key: 'normalIncomeTax',       label: 'Normal\nincome tax',                    defaultWidth: 120 },
  { key: 'turnoverTax',           label: 'Turnover\ntax',                         defaultWidth: 110 },
  { key: 'taxOnAccountingProfit', label: 'Tax on\naccounting\nprofit',            defaultWidth: 120 },
  { key: 'differenceMinimumTax',  label: 'Difference of\nminimum tax',            defaultWidth: 130 },
  { key: 'superTax',              label: 'Super tax /\nhigh earning',             defaultWidth: 120 },
  { key: 'taxChargeable',         label: 'Tax\nchargeable',                       defaultWidth: 110 },
  { key: 'admittedIncomeTax',     label: 'Admitted\nincome tax',                  defaultWidth: 120 },
  { key: 'refundableIncomeTax',   label: 'Refundable\nincome tax',                defaultWidth: 120 },
]
const ALL_IT_COL_KEYS = IT_COLS.map(c => c.key)

async function exportIncomeTaxExcel(itReturns: any[], clientName: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CA Firm CRM'
  const ws = wb.addWorksheet('Income Tax Summary')

  const NAVY_HEX  = '132E57'
  const GOLD_HEX  = 'F2AC18'
  const LIGHT_GOLD = 'FEF3C7'
  const numFmt = '#,##0'

  const cols = [
    { header: 'Year',                                       key: 'year',                  width: 10, isNum: false },
    { header: 'Total Profit/Loss',                          key: 'totalProfitLoss',        width: 18, isNum: true  },
    { header: 'Profit/Loss exempt or subject to final tax', key: 'profitLossExempt',       width: 28, isNum: true  },
    { header: 'Amount Subject to Normal Tax',               key: 'amountSubjectNormal',    width: 22, isNum: true  },
    { header: 'Normal Income Tax',                          key: 'normalIncomeTax',        width: 18, isNum: true  },
    { header: 'Turnover Tax',                               key: 'turnoverTax',            width: 16, isNum: true  },
    { header: 'Tax on Accounting Profit',                   key: 'taxOnAccountingProfit',  width: 22, isNum: true  },
    { header: 'Difference of Minimum Tax',                  key: 'differenceMinimumTax',   width: 22, isNum: true  },
    { header: 'Super Tax / Tax on High Earning',            key: 'superTax',               width: 24, isNum: true  },
    { header: 'Tax Chargeable',                             key: 'taxChargeable',          width: 18, isNum: true  },
    { header: 'Admitted Income Tax',                        key: 'admittedIncomeTax',      width: 18, isNum: true  },
    { header: 'Refundable Income Tax',                      key: 'refundableIncomeTax',    width: 20, isNum: true  },
  ]

  ws.columns = cols.map(c => ({ key: c.key, width: c.width }))

  ws.mergeCells(1, 1, 1, cols.length)
  const titleCell = ws.getCell('A1')
  titleCell.value = `Income Tax Summary  |  ${clientName}`
  titleCell.font  = { name: 'Aptos', bold: true, size: 14, color: { argb: 'FF' + NAVY_HEX } }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD_HEX } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  ws.mergeCells(2, 1, 2, cols.length)
  const dateCell = ws.getCell('A2')
  dateCell.value = `Exported: ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`
  dateCell.font  = { name: 'Aptos', size: 10, italic: true, color: { argb: 'FF' + NAVY_HEX } }
  dateCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9EC' } }
  dateCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  const headerRow = ws.getRow(3)
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.header
    cell.font  = { name: 'Aptos', bold: true, size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD_HEX } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + NAVY_HEX } } }
  })
  headerRow.height = 36

  const setCell = (row: ExcelJS.Row, colIdx: number, value: ExcelJS.CellValue, isNum: boolean, bg: string) => {
    const cell = row.getCell(colIdx)
    cell.value = value
    cell.font  = { name: 'Aptos', size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.alignment = { horizontal: isNum ? 'right' : 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    if (isNum) cell.numFmt = numFmt
  }

  itReturns.forEach((r, idx) => {
    const row = ws.addRow([])
    const bg  = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F9FA'
    const rowData: ExcelJS.CellValue[] = [
      r.periodYear,
      Number(r.totalProfitLoss       ?? 0),
      Number(r.profitLossExempt      ?? 0),
      Number(r.amountSubjectNormal   ?? 0),
      Number(r.normalIncomeTax       ?? 0),
      Number(r.turnoverTax           ?? 0),
      Number(r.taxOnAccountingProfit ?? 0),
      Number(r.differenceMinimumTax  ?? 0),
      Number(r.superTax              ?? 0),
      Number(r.taxChargeable         ?? 0),
      Number(r.admittedIncomeTax     ?? 0),
      Number(r.refundableIncomeTax   ?? 0),
    ]
    rowData.forEach((val, i) => setCell(row, i + 1, val, cols[i].isNum, bg))
    row.height = 18
  })

  const totalRow = ws.addRow([])
  const dataStart = 4, dataEnd = 3 + itReturns.length
  cols.forEach((c, i) => {
    const cell = totalRow.getCell(i + 1)
    if (i === 0) cell.value = 'TOTAL'
    else if (c.isNum) {
      cell.value  = { formula: `SUM(${ws.getColumn(i + 1).letter}${dataStart}:${ws.getColumn(i + 1).letter}${dataEnd})` }
      cell.numFmt = numFmt
    }
    cell.font   = { name: 'Aptos', bold: true, size: 10, color: { argb: 'FF' + NAVY_HEX } }
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT_GOLD } }
    cell.alignment = { horizontal: c.isNum ? 'right' : 'center', vertical: 'middle' }
    cell.border = { top: { style: 'medium', color: { argb: 'FF' + GOLD_HEX } } }
  })
  totalRow.height = 20

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }]

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `income-tax-summary-${clientName.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().slice(0,10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Column Picker ─────────────────────────────────────────────────────────────
function SummaryColumnPicker({ visible, onChange, cols, allKeys }: { visible: string[]; onChange: (v: string[]) => void; cols: { key: string; label: string }[]; allKeys: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const allSelected = visible.length === cols.length
  const toggle = (key: string) => {
    if (visible.includes(key) && visible.length === 1) return
    onChange(visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key])
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderRadius: 30, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: open ? NAVY : 'rgba(255,255,255,0.18)',
        border: 'none', color: '#fff',
        fontFamily: '"Aptos", sans-serif',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3.75 9h16.5M3.75 15h16.5" />
        </svg>
        Columns {visible.length < cols.length && `(${visible.length}/${cols.length})`}
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
          background: '#0D1B2A', border: '1px solid #3F4753', borderRadius: 10,
          overflow: 'hidden', width: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #3F4753', background: 'rgba(30,132,150,0.15)' }}>
            <input type="checkbox" checked={allSelected}
              onChange={() => onChange(allSelected ? [allKeys[0]] : allKeys)}
              style={{ accentColor: TEAL, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FBDCB4', letterSpacing: '0.06em' }}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </label>
          {cols.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)}
                style={{ accentColor: TEAL, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: visible.includes(col.key) ? '#FBDCB4' : '#9FA7B2' }}>
                {col.label.replace('\n', ' ')}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

interface Client {
  id:           string
  businessName: string | null
  user:         { id: string; userCode: string; fullName: string; isActive: boolean }
  trainee:      { id: string; fullName: string } | null
}

interface IncomeTaxReturn {
  id:                    string
  periodYear:            number
  totalProfitLoss?:       number | null
  profitLossExempt?:      number | null
  amountSubjectNormal?:   number | null
  normalIncomeTax?:       number | null
  turnoverTax?:           number | null
  taxOnAccountingProfit?: number | null
  differenceMinimumTax?:  number | null
  superTax?:              number | null
  taxChargeable?:         number | null
  admittedIncomeTax?:     number | null
  refundableIncomeTax?:   number | null
}

interface SalesTaxReturn {
  id:                    string
  periodMonth:           number
  periodYear:            number
  authority:             string
  returnType:            string
  standardSales?:        number | null
  outputTaxStandard?:    number | null
  reducedRateSales?:     number | null
  outputTaxReduced?:     number | null
  exemptSales?:          number | null
  zeroRatedSales?:       number | null
  standardPurchases?:    number | null
  inputTaxStandard?:     number | null
  reducedRatePurchases?: number | null
  inputTaxReduced?:      number | null
  unregisteredPurchases?: number | null
  exemptPurchases?:      number | null
  zeroRatedPurchases?:   number | null
  normalTaxPayable?:     number | null
  furtherTaxPayable?:    number | null
  taxCarryForward?:      number | null
}

function fmt(v: number | null | undefined) {
  const n = v == null ? 0 : Number(v)
  if (n < 0) return `(${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})`
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function ColTotal(rows: SalesTaxReturn[], key: string) {
  const total = rows.reduce((s, r) => s + (Number((r as any)[key]) || 0), 0)
  if (total < 0) return `(${Math.abs(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})`
  return total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function TaxSummaryPage() {
  const [activeTax,     setActiveTax]     = useState('sales_tax')
  const [search,        setSearch]        = useState('')
  const [selected,      setSelected]      = useState<Client | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)

  const [clients,  setClients]  = useState<Client[]>([])
  const [cLoading, setCLoading] = useState(true)

  const [authority,   setAuthority]   = useState('all')
  const [returnType,  setReturnType]  = useState('all')
  const [filterYear,  setFilterYear]  = useState('this_year')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [returns,     setReturns]     = useState<SalesTaxReturn[]>([])
  const [rLoading,    setRLoading]    = useState(false)

  // Column visibility + widths (persisted to localStorage)
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    const saved = lsGet<string[]>(LS_ST_COLS, ALL_ST_COL_KEYS)
    const valid  = saved.filter(k => ALL_ST_COL_KEYS.includes(k))
    return valid.length > 0 ? valid : ALL_ST_COL_KEYS
  })
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const defaults = { __month__: 90, __authority__: 80, __returnType__: 90, ...Object.fromEntries(ST_COLS.map(c => [c.key, c.defaultWidth])) }
    return { ...defaults, ...lsGet<Record<string, number>>(LS_ST_WIDTHS, {}) }
  })
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null)

  useEffect(() => { lsSet(LS_ST_COLS,   visibleCols) }, [visibleCols])
  useEffect(() => { lsSet(LS_ST_WIDTHS, colWidths)   }, [colWidths])

  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = colWidths[key]
    resizingCol.current = { key, startX, startW }
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(60, startW + ev.clientX - startX)
      setColWidths(prev => ({ ...prev, [key]: newW }))
    }
    const onUp = () => {
      resizingCol.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [colWidths])

  const MONTH_COL_KEY = '__month__'
  const visibleSTCols = ST_COLS.filter(c => visibleCols.includes(c.key))

  // ── Income Tax states ─────────────────────────────────────────────────────
  const [itVisibleCols, setItVisibleCols] = useState<string[]>(() => {
    const saved = lsGet<string[]>(LS_IT_COLS, ALL_IT_COL_KEYS)
    const valid  = saved.filter(k => ALL_IT_COL_KEYS.includes(k))
    return valid.length > 0 ? valid : ALL_IT_COL_KEYS
  })
  const [itColWidths, setItColWidths] = useState<Record<string, number>>(() => {
    const defaults = { __year__: 90, ...Object.fromEntries(IT_COLS.map(c => [c.key, c.defaultWidth])) }
    return { ...defaults, ...lsGet<Record<string, number>>(LS_IT_WIDTHS, {}) }
  })
  const itResizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null)

  useEffect(() => { lsSet(LS_IT_COLS,   itVisibleCols) }, [itVisibleCols])
  useEffect(() => { lsSet(LS_IT_WIDTHS, itColWidths)   }, [itColWidths])

  const onItResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = itColWidths[key]
    itResizingCol.current = { key, startX, startW }
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(60, startW + ev.clientX - startX)
      setItColWidths(prev => ({ ...prev, [key]: newW }))
    }
    const onUp = () => {
      itResizingCol.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [itColWidths])

  const visibleITCols = IT_COLS.filter(c => itVisibleCols.includes(c.key))

  const [itReturns,    setItReturns]    = useState<IncomeTaxReturn[]>([])
  const [itRLoading,   setItRLoading]   = useState(false)
  const [itFromYear,   setItFromYear]   = useState('')
  const [itToYear,     setItToYear]     = useState('')

  const IT_EMPTY_FORM = { periodYear: new Date().getFullYear().toString(), totalProfitLoss:'', profitLossExempt:'', amountSubjectNormal:'', normalIncomeTax:'', turnoverTax:'', taxOnAccountingProfit:'', differenceMinimumTax:'', superTax:'', taxChargeable:'', admittedIncomeTax:'', refundableIncomeTax:'' }
  const [itEntryModal,   setItEntryModal]   = useState(false)
  const [itEditingEntry, setItEditingEntry] = useState(false)
  const [itEntryForm,    setItEntryForm]    = useState<Record<string,string>>(IT_EMPTY_FORM)
  const [itEntrySaving,  setItEntrySaving]  = useState(false)

  useEffect(() => {
    if (!selected || activeTax !== 'income_tax') { setItReturns([]); return }
    setItRLoading(true)
    api.get('/income-tax-returns', { params: { clientId: selected.id } })
      .then(r => { const d = r.data?.data ?? r.data; setItReturns(Array.isArray(d) ? d : []) })
      .catch(() => setItReturns([]))
      .finally(() => setItRLoading(false))
  }, [selected, activeTax])

  const filteredITReturns = useMemo(() => {
    let rows = itReturns
    if (itFromYear) rows = rows.filter(r => r.periodYear >= Number(itFromYear))
    if (itToYear)   rows = rows.filter(r => r.periodYear <= Number(itToYear))
    return rows
  }, [itReturns, itFromYear, itToYear])

  const openItAddModal = () => {
    setItEditingEntry(false)
    setItEntryForm({ ...IT_EMPTY_FORM })
    setItEntryModal(true)
  }
  const openItEditModal = (r: IncomeTaxReturn) => {
    setItEditingEntry(true)
    const str = (v: any) => (v == null ? '' : String(v))
    setItEntryForm({
      periodYear:            String(r.periodYear),
      totalProfitLoss:       str(r.totalProfitLoss),
      profitLossExempt:      str(r.profitLossExempt),
      amountSubjectNormal:   str(r.amountSubjectNormal),
      normalIncomeTax:       str(r.normalIncomeTax),
      turnoverTax:           str(r.turnoverTax),
      taxOnAccountingProfit: str(r.taxOnAccountingProfit),
      differenceMinimumTax:  str(r.differenceMinimumTax),
      superTax:              str(r.superTax),
      taxChargeable:         str(r.taxChargeable),
      admittedIncomeTax:     str(r.admittedIncomeTax),
      refundableIncomeTax:   str(r.refundableIncomeTax),
    })
    setItEntryModal(true)
  }
  const saveItEntry = async () => {
    if (!selected) return
    setItEntrySaving(true)
    const numF = (k: string) => { const v = itEntryForm[k]; return v !== '' ? Number(String(v).replace(/,/g,'')) : undefined }
    try {
      await api.post('/income-tax-returns', {
        clientId:              selected.id,
        periodYear:            Number(itEntryForm.periodYear),
        totalProfitLoss:       numF('totalProfitLoss'),
        profitLossExempt:      numF('profitLossExempt'),
        amountSubjectNormal:   numF('amountSubjectNormal'),
        normalIncomeTax:       numF('normalIncomeTax'),
        turnoverTax:           numF('turnoverTax'),
        taxOnAccountingProfit: numF('taxOnAccountingProfit'),
        differenceMinimumTax:  numF('differenceMinimumTax'),
        superTax:              numF('superTax'),
        taxChargeable:         numF('taxChargeable'),
        admittedIncomeTax:     numF('admittedIncomeTax'),
        refundableIncomeTax:   numF('refundableIncomeTax'),
      })
      setItEntryModal(false)
      showToast('Entry saved successfully')
      const r = await api.get('/income-tax-returns', { params: { clientId: selected.id } })
      const d = r.data?.data ?? r.data
      setItReturns(Array.isArray(d) ? d : [])
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Failed to save', false)
    } finally { setItEntrySaving(false) }
  }

  // Add/Edit entry modal
  const EMPTY_FORM = { periodMonth: '1', periodYear: new Date().getFullYear().toString(), authority: 'FBR', returnType: 'ORIGINAL', standardSales:'', outputTaxStandard:'', reducedRateSales:'', outputTaxReduced:'', exemptSales:'', zeroRatedSales:'', standardPurchases:'', inputTaxStandard:'', reducedRatePurchases:'', inputTaxReduced:'', unregisteredPurchases:'', exemptPurchases:'', zeroRatedPurchases:'', normalTaxPayable:'', furtherTaxPayable:'', taxCarryForward:'' }
  const [entryModal,    setEntryModal]    = useState(false)
  const [editingEntry,  setEditingEntry]  = useState(false)
  const [entryForm,     setEntryForm]     = useState<Record<string,string>>(EMPTY_FORM)
  const [entrySaving,   setEntrySaving]   = useState(false)
  const [toast,       setToast]       = useState<{msg:string;ok:boolean}|null>(null)

  const showToast = (msg: string, ok = true) => { setToast({msg,ok}); setTimeout(() => setToast(null), 2500) }

  const openAddModal = () => {
    setEditingEntry(false)
    setEntryForm({ ...EMPTY_FORM, authority, periodYear: new Date().getFullYear().toString() })
    setEntryModal(true)
  }

  const openEditModal = (r: SalesTaxReturn) => {
    setEditingEntry(true)
    const str = (v: any) => (v == null ? '' : String(v))
    setEntryForm({
      periodMonth:           String(r.periodMonth),
      periodYear:            String(r.periodYear),
      authority:             (r as any).authority   ?? 'FBR',
      returnType:            (r as any).returnType  ?? 'ORIGINAL',
      standardSales:         str((r as any).standardSales),
      outputTaxStandard:     str((r as any).outputTaxStandard),
      reducedRateSales:      str((r as any).reducedRateSales),
      outputTaxReduced:      str((r as any).outputTaxReduced),
      exemptSales:           str((r as any).exemptSales),
      zeroRatedSales:        str((r as any).zeroRatedSales),
      standardPurchases:     str((r as any).standardPurchases),
      inputTaxStandard:      str((r as any).inputTaxStandard),
      reducedRatePurchases:  str((r as any).reducedRatePurchases),
      inputTaxReduced:       str((r as any).inputTaxReduced),
      unregisteredPurchases: str((r as any).unregisteredPurchases),
      exemptPurchases:       str((r as any).exemptPurchases),
      zeroRatedPurchases:    str((r as any).zeroRatedPurchases),
      normalTaxPayable:      str((r as any).normalTaxPayable),
      furtherTaxPayable:     str((r as any).furtherTaxPayable),
      taxCarryForward:       str((r as any).taxCarryForward),
    })
    setEntryModal(true)
  }

  const saveEntry = async () => {
    if (!selected) return
    setEntrySaving(true)
    const numF = (k: string) => { const v = entryForm[k]; return v !== '' ? Number(String(v).replace(/,/g,'')) : undefined }
    try {
      await api.post('/sales-tax-returns', {
        clientId:              selected.id,
        periodMonth:           Number(entryForm.periodMonth),
        periodYear:            Number(entryForm.periodYear),
        authority:             entryForm.authority,
        returnType:            entryForm.returnType,
        standardSales:         numF('standardSales'),
        outputTaxStandard:     numF('outputTaxStandard'),
        reducedRateSales:      numF('reducedRateSales'),
        outputTaxReduced:      numF('outputTaxReduced'),
        exemptSales:           numF('exemptSales'),
        zeroRatedSales:        numF('zeroRatedSales'),
        standardPurchases:     numF('standardPurchases'),
        inputTaxStandard:      numF('inputTaxStandard'),
        reducedRatePurchases:  numF('reducedRatePurchases'),
        inputTaxReduced:       numF('inputTaxReduced'),
        unregisteredPurchases: numF('unregisteredPurchases'),
        exemptPurchases:       numF('exemptPurchases'),
        zeroRatedPurchases:    numF('zeroRatedPurchases'),
        normalTaxPayable:      numF('normalTaxPayable'),
        furtherTaxPayable:     numF('furtherTaxPayable'),
        taxCarryForward:       numF('taxCarryForward'),
      })
      setEntryModal(false)
      showToast('Entry saved successfully')
      // Refresh returns
      const r = await api.get('/sales-tax-returns', { params: { clientId: selected.id } })
      const d = r.data?.data ?? r.data
      setReturns(Array.isArray(d) ? d : [])
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Failed to save', false)
    } finally { setEntrySaving(false) }
  }

  // Fetch clients once
  useEffect(() => {
    setCLoading(true)
    api.get('/clients')
      .then(r => {
        const data = r.data?.data ?? r.data ?? []
        setClients(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => setCLoading(false))
  }, [])

  // Fetch all returns for client, filter client-side
  useEffect(() => {
    if (!selected || activeTax !== 'sales_tax') { setReturns([]); return }
    setRLoading(true)
    api.get('/sales-tax-returns', { params: { clientId: selected.id } })
      .then(r => {
        const d = r.data?.data ?? r.data
        setReturns(Array.isArray(d) ? d : [])
      })
      .catch(() => setReturns([]))
      .finally(() => setRLoading(false))
  }, [selected, activeTax])

  const filteredReturns = useMemo(() => {
    let rows = returns
    if (authority  !== 'all') rows = rows.filter(r => r.authority  === authority)
    if (returnType !== 'all') rows = rows.filter(r => r.returnType === returnType)
    if (filterYear === 'this_year') {
      const MONTH_NUM: Record<string, number> = {
        JANUARY:1,FEBRUARY:2,MARCH:3,APRIL:4,MAY:5,JUNE:6,
        JULY:7,AUGUST:8,SEPTEMBER:9,OCTOBER:10,NOVEMBER:11,DECEMBER:12,
      }
      const now        = new Date()
      const cm         = now.getMonth() + 1
      const cy         = now.getFullYear()
      const ye         = (selected as any)?.yearEnd ?? 'DECEMBER'
      const endMonth   = MONTH_NUM[ye] ?? 12
      // Fiscal year start is the month after year-end
      const startMonth = endMonth === 12 ? 1 : endMonth + 1
      // Determine which fiscal year we're currently in
      let startYear: number, endYear: number
      if (endMonth === 12) {
        // Calendar year
        startYear = cy; endYear = cy
      } else if (cm > endMonth) {
        // We've passed the year-end this calendar year → fiscal year started this year
        startYear = cy; endYear = cy + 1
      } else {
        // We're before the year-end → fiscal year started last year
        startYear = cy - 1; endYear = cy
      }
      rows = rows.filter(r => {
        const after  = r.periodYear > startYear || (r.periodYear === startYear && r.periodMonth >= startMonth)
        const before = r.periodYear < endYear   || (r.periodYear === endYear   && r.periodMonth <= endMonth)
        return after && before
      })
    }
    if (filterYear === 'custom') {
      if (customFrom) {
        const [fy, fm] = customFrom.split('-').map(Number)
        rows = rows.filter(r => r.periodYear > fy || (r.periodYear === fy && r.periodMonth >= fm))
      }
      if (customTo) {
        const [ty, tm] = customTo.split('-').map(Number)
        rows = rows.filter(r => r.periodYear < ty || (r.periodYear === ty && r.periodMonth <= tm))
      }
    }
    return rows
  }, [returns, authority, returnType, filterYear, customFrom, customTo])

  const filtered = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    return clients.filter(c =>
      c.businessName?.toLowerCase().includes(q) ||
      c.user.fullName?.toLowerCase().includes(q) ||
      c.user.userCode?.toLowerCase().includes(q)
    )
  }, [clients, search])

  const activeTab = TAX_TABS.find(t => t.key === activeTax)!
  const displayName = (c: Client) => c.businessName || c.user.fullName

  const PillsRow = (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 24px 8px', background: '#f7f8fa' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: 3 }}>
          {TAX_TABS.map(tab => {
            const active = activeTax === tab.key
            return (
              <button key={tab.key}
                onClick={() => setActiveTax(tab.key)}
                style={{
                  flexShrink: 0, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: "'Aptos', sans-serif", fontSize: 12,
                  fontWeight: active ? 700 : 500, transition: 'all .15s',
                  border: 'none',
                  background: active ? tab.color : 'transparent',
                  color: active ? '#fff' : '#5C5C5C', whiteSpace: 'nowrap',
                }}
              >{tab.label}</button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3, flexShrink: 0 }}>
        {TAX_TABS.map(tab => (
          <div key={tab.key} style={{
            flex: 1, background: tab.color, borderRadius: 2,
            opacity: activeTax === tab.key ? 1 : 0.35, transition: 'opacity .2s',
          }} />
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh', overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:20, right:24, zIndex:9999, background: toast.ok ? '#166534' : '#B91C1C', color:'#fff', padding:'10px 22px', borderRadius:10, fontSize:13, fontWeight:600, boxShadow:'0 4px 16px rgba(0,0,0,0.18)' }}>
          {toast.msg}
        </div>
      )}

      {/* Add Entry Modal */}
      {entryModal && selected && (() => {
        const F = "'Aptos', sans-serif"
        const fmtAcct = (raw: string) => {
          const n = parseFloat(raw.replace(/,/g, ''))
          if (isNaN(n)) return raw
          return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        }
        const inp = (key: string) => (
          <input key={key}
            value={entryForm[key]}
            onChange={e => setEntryForm(p => ({...p,[key]:e.target.value.replace(/,/g,'')}))}
            onBlur={e => { const v = e.target.value; if (v !== '') setEntryForm(p => ({...p,[key]:fmtAcct(v)})) }}
            onFocus={e => { setEntryForm(p => ({...p,[key]:p[key].replace(/,/g,'')})) }}
            placeholder="0"
            style={{ width:'100%', boxSizing:'border-box', padding:'8px 11px', borderRadius:8, border:`1.5px solid #E2E8F0`, fontSize:13, fontFamily:F, outline:'none', color:NAVY, fontWeight:500, background:'#FAFBFC' }} />
        )
        const lbl = (text: string) => (
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', fontFamily:F, marginBottom:4 }}>{text}</div>
        )
        const sectionHdr = (text: string, color: string) => (
          <div style={{ display:'flex', alignItems:'center', gap:8, margin:'16px 0 10px' }}>
            <div style={{ width:3, height:16, borderRadius:2, background:color, flexShrink:0 }} />
            <span style={{ fontSize:12, fontWeight:800, color, fontFamily:F, letterSpacing:'0.04em', textTransform:'uppercase' }}>{text}</span>
            <div style={{ flex:1, height:1, background:'#E2E8F0' }} />
          </div>
        )
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:580, boxShadow:'0 24px 60px rgba(0,0,0,0.22)', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

              {/* Header */}
              <div style={{ background:'#7EC8D0', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:300, color:NAVY, fontFamily:"'Ethnocentric Rg', sans-serif", letterSpacing:'0.04em' }}>{editingEntry ? 'Edit Sales Tax Entry' : 'Add Sales Tax Entry'}</div>
                  <div style={{ fontSize:12, color:NAVY, fontFamily:F, marginTop:3, fontWeight:600, opacity:0.75 }}>{displayName(selected)}</div>
                </div>
                <button onClick={() => setEntryModal(false)} style={{ background:'rgba(255,255,255,0.35)', border:'none', borderRadius:8, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:NAVY, fontSize:18, lineHeight:1, fontWeight:700 }}>×</button>
              </div>

              {/* Body */}
              <div style={{ overflowY:'auto', padding:'16px 20px 20px', flex:1 }}>

                {/* Period & Authority row */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, padding:'4px 0 12px', borderBottom:`1px solid #E2E8F0` }}>
                  <div>
                    {lbl('Month')}
                    <StyledSelect
                      value={String(entryForm.periodMonth)}
                      onChange={val => setEntryForm(p => ({...p, periodMonth: val}))}
                      options={MONTH_NAMES.map((m,i) => ({ value: String(i+1), label: m }))}
                    />
                  </div>
                  <div>
                    {lbl('Year')}
                    {inp('periodYear')}
                  </div>
                  <div>
                    {lbl('Authority')}
                    <StyledSelect
                      value={entryForm.authority}
                      onChange={val => setEntryForm(p => ({...p, authority: val}))}
                      options={AUTHORITIES.map(a => ({ value: a, label: a }))}
                    />
                  </div>
                  <div>
                    {lbl('Return Type')}
                    <StyledSelect
                      value={entryForm.returnType}
                      onChange={val => setEntryForm(p => ({...p, returnType: val}))}
                      options={[{ value: 'ORIGINAL', label: 'Original' }, { value: 'REVISED', label: 'Revised' }]}
                    />
                  </div>
                </div>

                {/* Sales section */}
                {sectionHdr('Sales', '#1E8496')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                  {([['standardSales','Standard Sales (excl. tax)'],['outputTaxStandard','Output Tax on Standard Sales'],['reducedRateSales','Reduced Rate Sales (excl. tax)'],['outputTaxReduced','Output Tax on Reduced Rate'],['exemptSales','Exempt Sales'],['zeroRatedSales','Zero Rated Sales']] as [string,string][]).map(([key,label]) => (
                    <div key={key}>{lbl(label)}{inp(key)}</div>
                  ))}
                </div>

                {/* Purchases section */}
                {sectionHdr('Purchases', '#7B2D8E')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                  {([['standardPurchases','Standard Purchases (excl. tax)'],['inputTaxStandard','Input Tax on Standard'],['reducedRatePurchases','Reduced Rate Purchases (excl. tax)'],['inputTaxReduced','Input Tax on Reduced Rate'],['unregisteredPurchases','Unregistered Purchases'],['exemptPurchases','Exempt Purchases'],['zeroRatedPurchases','Zero Rated Purchases']] as [string,string][]).map(([key,label]) => (
                    <div key={key}>{lbl(label)}{inp(key)}</div>
                  ))}
                </div>

                {/* Tax Payable section */}
                {sectionHdr('Tax Payable', '#C25A1F')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px 14px' }}>
                  {([['normalTaxPayable','Normal Tax Payable'],['furtherTaxPayable','Further Tax Payable'],['taxCarryForward','Tax Carry Forward']] as [string,string][]).map(([key,label]) => (
                    <div key={key}>{lbl(label)}{inp(key)}</div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:'12px 20px', borderTop:`1px solid #E2E8F0`, display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0, background:'#FAFBFC' }}>
                <button onClick={() => setEntryModal(false)} style={{ padding:'9px 20px', borderRadius:9, border:`1.5px solid #E2E8F0`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F, color:'#64748B' }}>Cancel</button>
                <button onClick={saveEntry} disabled={entrySaving} style={{ padding:'9px 24px', borderRadius:9, border:'none', cursor: entrySaving ? 'not-allowed' : 'pointer', background:`linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity: entrySaving ? 0.6 : 1 }}>
                  {entrySaving ? 'Saving…' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Left panel ── */}
      <div style={{
        width: listCollapsed ? 0 : 280, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: '#EDF0F3', borderRight: `1px solid ${P.border}`,
        overflow: 'hidden', transition: 'width .25s',
      }}>
        <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', height: '100%' }}>

          <div style={{ flexShrink: 0, borderBottom: `1px solid ${P.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: '0 14px' }}>
              <h2 style={{ margin: 0, fontFamily: "'Ethnocentric Rg', sans-serif", fontWeight: 300, fontSize: 16, color: NAVY }}>
                Tax Summary
              </h2>
              <button
                onClick={() => setListCollapsed(true)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6 }}
                onMouseEnter={e => { e.currentTarget.style.color = NAVY }}
                onMouseLeave={e => { e.currentTarget.style.color = P.iconMuted }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${P.border}`, borderRadius: 8, padding: '7px 10px' }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search clients…"
                  style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, fontFamily: "'Aptos', sans-serif", background: 'transparent', color: NAVY }}
                />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {cLoading && <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>Loading…</div>}
            {!cLoading && filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: P.textMuted, fontSize: 12 }}>
                {search ? `No clients matching "${search}".` : 'No clients found.'}
              </div>
            )}
            {!cLoading && filtered.map(c => {
              const isActive = selected?.id === c.id
              return (
                <button key={c.id}
                  onClick={() => setSelected(c)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 14px', border: 'none', cursor: 'pointer',
                    borderBottom: `1px solid ${P.border}`,
                    background: isActive ? '#E8EEF7' : '#F8FAFC',
                    borderLeft: isActive ? `3px solid ${TEAL}` : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#EEF2F7' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: isActive ? TEAL : NAVY }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? TEAL : NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(c)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f7f8fa', overflow: 'hidden' }}>

        {PillsRow}

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>

          {listCollapsed && (
            <button onClick={() => setListCollapsed(false)}
              style={{
                position: 'absolute', top: 12, left: 12, zIndex: 20,
                width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Empty state — no client selected */}
          {!selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 40, color: P.border }}>←</p>
                <p style={{ fontSize: 13, color: P.textMuted, fontFamily: "'Aptos', sans-serif" }}>
                  Select a client to view their tax summary
                </p>
              </div>
            </div>
          )}

          {/* Client selected */}
          {selected && (
            <div style={{ padding: '16px 20px', minWidth: 900 }}>

              {/* Client header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 300, color: NAVY, fontFamily: "'Ethnocentric Rg', sans-serif", letterSpacing: '0.04em', flex: 1 }}>
                  {displayName(selected)}
                </h2>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.textMuted, padding: 4 }}>
                  <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Sales Tax tab — authority filter + table */}
              {activeTax === 'sales_tax' && (
                <>
                  {/* Filter bar — same style as Tasks */}
                  <div style={{ background: '#EDF0F3', margin: '-16px -20px 16px', padding: '10px 16px', borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: TEAL, borderRadius: 40, padding: '5px 8px' }}>

                      {/* Authority */}
                      <select value={authority} onChange={e => setAuthority(e.target.value)}
                        style={{ flexShrink:0, padding:'4px 10px', borderRadius:30, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', background: authority !== 'all' ? NAVY : 'rgba(255,255,255,0.18)', color:'#fff', outline:'none', appearance:'none', paddingRight:24, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                        <option value="all" style={{ background: NAVY }}>All Authorities</option>
                        {AUTHORITIES.map(a => <option key={a} value={a} style={{ background: NAVY }}>{a}</option>)}
                      </select>

                      <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

                      {/* Return Type */}
                      <select value={returnType} onChange={e => setReturnType(e.target.value)}
                        style={{ flexShrink:0, padding:'4px 10px', borderRadius:30, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', background: returnType !== 'all' ? NAVY : 'rgba(255,255,255,0.18)', color:'#fff', outline:'none', appearance:'none', paddingRight:24, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                        <option value="all" style={{ background: NAVY }}>All Types</option>
                        <option value="ORIGINAL" style={{ background: NAVY }}>Original</option>
                        <option value="REVISED"  style={{ background: NAVY }}>Revised</option>
                      </select>

                      <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

                      {/* Year pills */}
                      {(['this_year','custom'] as const).map((key) => (
                        <button key={key} onClick={() => setFilterYear(key)}
                          style={{ flexShrink:0, padding:'4px 12px', borderRadius:40, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', transition:'all .15s', whiteSpace:'nowrap', background: filterYear === key ? NAVY : 'transparent', color: filterYear === key ? '#fff' : 'rgba(255,255,255,0.85)' }}>
                          {key === 'this_year' ? 'This Year' : 'Custom'}
                        </button>
                      ))}
                      {filterYear === 'custom' && (
                        <>
                          <input type="month" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:11, fontFamily:'"Aptos",sans-serif', outline:'none', cursor:'pointer', colorScheme:'dark' }} />
                          <span style={{ color:'rgba(255,255,255,0.7)', fontSize:11, flexShrink:0 }}>to</span>
                          <input type="month" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:11, fontFamily:'"Aptos",sans-serif', outline:'none', cursor:'pointer', colorScheme:'dark' }} />
                        </>
                      )}

                      <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

                      {/* Count */}
                      <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.9)', fontFamily:'"Aptos",sans-serif', whiteSpace:'nowrap', marginLeft:4 }}>
                        {filteredReturns.length} {filteredReturns.length === 1 ? 'entry' : 'entries'}
                      </span>

                      {/* Column picker + Export + Add Entry */}
                      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        <SummaryColumnPicker visible={visibleCols} onChange={setVisibleCols} cols={ST_COLS} allKeys={ALL_ST_COL_KEYS} />
                        <button
                          onClick={() => exportSalesTaxExcel(filteredReturns, displayName(selected))}
                          disabled={filteredReturns.length === 0}
                          style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:30, border:'none', cursor: filteredReturns.length === 0 ? 'not-allowed' : 'pointer', background:'#16a34a', color:'#fff', fontSize:12, fontWeight:700, fontFamily:'"Aptos",sans-serif', opacity: filteredReturns.length === 0 ? 0.5 : 1 }}>
                          <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                          Export Excel
                        </button>
                        <button onClick={openAddModal}
                          style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:30, border:'none', cursor:'pointer', background: NAVY, color:'#fff', fontSize:12, fontWeight:700, fontFamily:'"Aptos",sans-serif' }}>
                          <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Add Entry
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${P.border}` }}>
                    <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:13, tableLayout:'fixed' }}>
                      <colgroup>
                        <col style={{ width: colWidths['__month__'] }} />
                        <col style={{ width: colWidths['__authority__'] }} />
                        <col style={{ width: colWidths['__returnType__'] }} />
                        {visibleSTCols.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
                        <col style={{ width:48 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, position:'sticky', left:0, zIndex:3, userSelect:'none' }}>
                            Month &amp; Year
                            <span onMouseDown={e => onResizeStart('__month__', e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                              <span style={{ width:2, height:'60%', background:'transparent', borderRadius:2 }} />
                            </span>
                          </th>
                          <th style={{ ...thStyle, position:'relative', userSelect:'none' }}>
                            Authority
                            <span onMouseDown={e => onResizeStart('__authority__', e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                              <span style={{ width:2, height:'60%', background:'transparent', borderRadius:2 }} />
                            </span>
                          </th>
                          <th style={{ ...thStyle, position:'relative', userSelect:'none' }}>
                            Type
                            <span onMouseDown={e => onResizeStart('__returnType__', e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                              <span style={{ width:2, height:'60%', background:'transparent', borderRadius:2 }} />
                            </span>
                          </th>
                          {visibleSTCols.map(c => (
                            <th key={c.key} style={{ ...thStyle, position:'relative', userSelect:'none' }}>
                              {c.label}
                              <span onMouseDown={e => onResizeStart(c.key, e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                                <span style={{ width:2, height:'60%', background:'transparent', borderRadius:2 }} />
                              </span>
                            </th>
                          ))}
                          <th style={{ ...thStyle, width:48 }}>Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rLoading && <tr><td colSpan={visibleSTCols.length + 4} style={{ ...tdStyle, textAlign:'center', color:P.textMuted, padding:24 }}>Loading…</td></tr>}
                        {!rLoading && filteredReturns.length === 0 && <tr><td colSpan={visibleSTCols.length + 4} style={{ ...tdStyle, textAlign:'center', color:P.textMuted, padding:24 }}>No returns found for this client.</td></tr>}
                        {!rLoading && filteredReturns.map((r, i) => (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                            <td style={{ ...tdStyle, fontWeight:700, color:NAVY, position:'sticky', left:0, background: i%2===0?'#fff':'#F8FAFC', zIndex:1 }}>
                              {MONTH_NAMES[r.periodMonth - 1]}-{String(r.periodYear).slice(2)}
                            </td>
                            <td style={{ ...tdStyle, fontWeight:600, color:TEAL }}>{(r as any).authority ?? ''}</td>
                            <td style={{ ...tdStyle, fontSize:11, fontWeight:600, color:(r as any).returnType === 'REVISED' ? '#C25A1F' : '#3A6B3A' }}>
                              {(r as any).returnType === 'REVISED' ? 'Revised' : 'Original'}
                            </td>
                            {visibleSTCols.map(c => (
                              <td key={c.key} style={{ ...tdStyle, textAlign:'right' }}>{fmt((r as any)[c.key])}</td>
                            ))}
                            <td style={{ ...tdStyle, textAlign:'center', width:48, padding:'4px 6px' }}>
                              <button onClick={() => openEditModal(r)} title="Edit entry"
                                style={{ background:'none', border:'none', cursor:'pointer', color:TEAL, padding:4, borderRadius:6 }}>
                                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.25 2.25 0 113.182 3.182L7.5 20.213l-4.182.465.465-4.182L16.862 4.487z" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {!rLoading && filteredReturns.length > 0 && (
                        <tfoot>
                          <tr style={{ background:'#FEF3C7', borderTop:`2px solid #F2AC18` }}>
                            <td style={{ ...tdStyle, fontWeight:700, color:NAVY, position:'sticky', left:0, background:'#FEF3C7', zIndex:1, letterSpacing:'0.05em', textTransform:'uppercase', fontSize:11 }}>Total</td>
                            <td style={{ ...tdStyle, background:'#FEF3C7' }} />
                            <td style={{ ...tdStyle, background:'#FEF3C7' }} />
                            {visibleSTCols.map(c => (
                              <td key={c.key} style={{ ...tdStyle, textAlign:'right', fontWeight:700, color:NAVY, background:'#FEF3C7' }}>
                                {ColTotal(filteredReturns, c.key)}
                              </td>
                            ))}
                            <td style={{ ...tdStyle, background:'#FEF3C7' }} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}

              {/* ── Income Tax tab ── */}
              {activeTax === 'income_tax' && selected && (() => {
                const F = "'Aptos', sans-serif"
                const fmtAcct = (raw: string) => {
                  const n = parseFloat(raw.replace(/,/g,''))
                  if (isNaN(n)) return raw
                  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                }
                const numInp = (key: string) => (
                  <input key={key}
                    value={itEntryForm[key] ?? ''}
                    onChange={e => setItEntryForm(p => ({...p,[key]:e.target.value.replace(/,/g,'')}))}
                    onBlur={e  => { const v = e.target.value; if (v !== '') setItEntryForm(p => ({...p,[key]:fmtAcct(v)})) }}
                    onFocus={() => setItEntryForm(p => ({...p,[key]:(p[key]??'').replace(/,/g,'')}))}
                    placeholder="0"
                    style={{ width:'100%', boxSizing:'border-box', padding:'8px 11px', borderRadius:8, border:`1.5px solid #E2E8F0`, fontSize:13, fontFamily:F, outline:'none', color:NAVY, fontWeight:500, background:'#FAFBFC' }} />
                )
                const lbl = (text: string) => <div style={{ fontSize:11, fontWeight:700, color:'#64748B', fontFamily:F, marginBottom:4 }}>{text}</div>
                return (
                  <>
                    {/* Filter bar — same style as Sales Tax */}
                    <div style={{ background:'#EDF0F3', margin:'-16px -20px 16px', padding:'10px 16px', borderBottom:`1px solid ${P.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, background:TEAL, borderRadius:40, padding:'5px 8px' }}>

                        {/* Year range */}
                        <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.85)', fontFamily:'"Aptos",sans-serif', whiteSpace:'nowrap', paddingLeft:4 }}>Year:</span>
                        <input type="number" value={itFromYear} onChange={e => setItFromYear(e.target.value)} placeholder="From"
                          style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:11, fontFamily:'"Aptos",sans-serif', outline:'none', width:72, colorScheme:'dark' }} />
                        <span style={{ color:'rgba(255,255,255,0.7)', fontSize:11, flexShrink:0 }}>—</span>
                        <input type="number" value={itToYear} onChange={e => setItToYear(e.target.value)} placeholder="To"
                          style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:11, fontFamily:'"Aptos",sans-serif', outline:'none', width:72, colorScheme:'dark' }} />

                        <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

                        {/* Count */}
                        <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.9)', fontFamily:'"Aptos",sans-serif', whiteSpace:'nowrap', marginLeft:4 }}>
                          {filteredITReturns.length} {filteredITReturns.length === 1 ? 'entry' : 'entries'}
                        </span>

                        {/* Column picker + Export + Add Entry */}
                        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                          <SummaryColumnPicker visible={itVisibleCols} onChange={setItVisibleCols} cols={IT_COLS} allKeys={ALL_IT_COL_KEYS} />
                          <button
                            onClick={() => exportIncomeTaxExcel(filteredITReturns, displayName(selected))}
                            disabled={filteredITReturns.length === 0}
                            style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:30, border:'none', cursor:filteredITReturns.length===0?'not-allowed':'pointer', background:'#16a34a', color:'#fff', fontSize:12, fontWeight:700, fontFamily:'"Aptos",sans-serif', opacity:filteredITReturns.length===0?0.5:1 }}>
                            <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            Export Excel
                          </button>
                          <button onClick={openItAddModal} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:30, border:'none', cursor:'pointer', background:NAVY, color:'#fff', fontSize:12, fontWeight:700, fontFamily:'"Aptos",sans-serif' }}>
                            <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            Add Entry
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${P.border}` }}>
                      <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:13, tableLayout:'fixed' }}>
                        <colgroup>
                          <col style={{ width: itColWidths['__year__'] }} />
                          {visibleITCols.map(c => <col key={c.key} style={{ width: itColWidths[c.key] }} />)}
                          <col style={{ width: 48 }} />
                        </colgroup>
                        <thead>
                          <tr>
                            {/* Year header */}
                            <th style={{ ...thStyle, position:'sticky', left:0, zIndex:3, textAlign:'center', width: itColWidths['__year__'], userSelect:'none' }}>
                              Year
                              <span onMouseDown={e => onItResizeStart('__year__', e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                                <span style={{ width:2, height:'60%', background:'transparent', borderRadius:2 }} />
                              </span>
                            </th>
                            {visibleITCols.map(c => (
                              <th key={c.key} style={{ ...thStyle, position:'relative', userSelect:'none' }}>
                                {c.label}
                                <span onMouseDown={e => onItResizeStart(c.key, e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                                  <span style={{ width:2, height:'60%', background:'transparent', borderRadius:2 }} />
                                </span>
                              </th>
                            ))}
                            <th style={{ ...thStyle, width:48 }}>Edit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itRLoading && <tr><td colSpan={visibleITCols.length + 2} style={{ ...tdStyle, textAlign:'center', color:P.textMuted, padding:24 }}>Loading…</td></tr>}
                          {!itRLoading && filteredITReturns.length === 0 && <tr><td colSpan={visibleITCols.length + 2} style={{ ...tdStyle, textAlign:'center', color:P.textMuted, padding:24 }}>No returns found for this client.</td></tr>}
                          {!itRLoading && filteredITReturns.map((r, i) => (
                            <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                              <td style={{ ...tdStyle, fontWeight:700, color:NAVY, position:'sticky', left:0, background: i%2===0?'#fff':'#F8FAFC', zIndex:1 }}>{r.periodYear}</td>
                              {visibleITCols.map(c => (
                                <td key={c.key} style={{ ...tdStyle, textAlign:'right' }}>{fmt((r as any)[c.key])}</td>
                              ))}
                              <td style={{ ...tdStyle, textAlign:'center', width:48, padding:'4px 6px' }}>
                                <button onClick={() => openItEditModal(r)} title="Edit entry"
                                  style={{ background:'none', border:'none', cursor:'pointer', color:TEAL, padding:4, borderRadius:6 }}>
                                  <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.25 2.25 0 113.182 3.182L7.5 20.213l-4.182.465.465-4.182L16.862 4.487z" /></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {!itRLoading && filteredITReturns.length > 0 && (
                          <tfoot>
                            <tr style={{ background:'#FEF3C7', borderTop:`2px solid #F2AC18` }}>
                              <td style={{ ...tdStyle, fontWeight:700, color:NAVY, position:'sticky', left:0, background:'#FEF3C7', zIndex:1, letterSpacing:'0.05em', textTransform:'uppercase', fontSize:11 }}>Total</td>
                              {visibleITCols.map(c => (
                                <td key={c.key} style={{ ...tdStyle, textAlign:'right', fontWeight:700, color:NAVY, background:'#FEF3C7' }}>
                                  {ColTotal(filteredITReturns as any, c.key)}
                                </td>
                              ))}
                              <td style={{ ...tdStyle, background:'#FEF3C7' }} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>

                    {/* Add/Edit Modal */}
                    {itEntryModal && (
                      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
                        <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:600, boxShadow:'0 24px 60px rgba(0,0,0,0.22)', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                          <div style={{ background:'#7EC8D0', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                            <div>
                              <div style={{ fontSize:14, fontWeight:300, color:NAVY, fontFamily:"'Ethnocentric Rg', sans-serif", letterSpacing:'0.04em' }}>{itEditingEntry ? 'Edit Income Tax Entry' : 'Add Income Tax Entry'}</div>
                              <div style={{ fontSize:12, color:NAVY, fontFamily:F, marginTop:3, fontWeight:600, opacity:0.75 }}>{displayName(selected)}</div>
                            </div>
                            <button onClick={() => setItEntryModal(false)} style={{ background:'rgba(255,255,255,0.35)', border:'none', borderRadius:8, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:NAVY, fontSize:18, fontWeight:700 }}>×</button>
                          </div>
                          <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
                            {/* Year */}
                            <div style={{ marginBottom:14 }}>
                              {lbl('Year')}
                              <input type="number" value={itEntryForm.periodYear}
                                onChange={e => setItEntryForm(p => ({...p,periodYear:e.target.value}))}
                                placeholder={new Date().getFullYear().toString()}
                                style={{ width:'100%', boxSizing:'border-box', padding:'8px 11px', borderRadius:8, border:`1.5px solid #E2E8F0`, fontSize:13, fontFamily:F, outline:'none', color:NAVY, fontWeight:500, background:'#FAFBFC' }} />
                            </div>
                            {/* Fields in 2 columns */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                              {([
                                ['totalProfitLoss',       'Total Profit/Loss'],
                                ['profitLossExempt',      'Profit/Loss exempt or final tax'],
                                ['amountSubjectNormal',   'Amount subject to normal tax'],
                                ['normalIncomeTax',       'Normal income tax'],
                                ['turnoverTax',           'Turnover tax'],
                                ['taxOnAccountingProfit', 'Tax on accounting profit'],
                                ['differenceMinimumTax',  'Difference of minimum tax'],
                                ['superTax',              'Super tax / High earning'],
                                ['taxChargeable',         'Tax chargeable'],
                                ['admittedIncomeTax',     'Admitted income tax'],
                                ['refundableIncomeTax',   'Refundable income tax'],
                              ] as [string,string][]).map(([k,l]) => <div key={k}>{lbl(l)}{numInp(k)}</div>)}
                            </div>
                          </div>
                          <div style={{ padding:'12px 20px', borderTop:`1px solid ${P.border}`, display:'flex', gap:8, justifyContent:'flex-end', background:'#FAFBFC', flexShrink:0 }}>
                            <button onClick={() => setItEntryModal(false)} style={{ padding:'9px 20px', borderRadius:9, border:`1.5px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F, color:'#64748B' }}>Cancel</button>
                            <button onClick={saveItEntry} disabled={itEntrySaving} style={{ padding:'9px 24px', borderRadius:9, border:'none', cursor:itEntrySaving?'not-allowed':'pointer', background:`linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity:itEntrySaving?0.5:1 }}>
                              {itEntrySaving ? 'Saving…' : 'Save Entry'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
              {activeTax === 'income_tax' && !selected && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:260, color:P.textMuted, fontFamily:"'Aptos', sans-serif", fontSize:13 }}>
                  Select a client to view Income Tax summary.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 5px 10px 5px', textAlign: 'center', color: '#1a1a1a',
  fontWeight: 600, fontSize: 12, letterSpacing: '0.07em',
  fontFamily: "'Aptos', sans-serif",
  whiteSpace: 'pre-line', lineHeight: 1.35,
  height: 52, verticalAlign: 'middle',
  background: '#F2AC18',
  borderRight: '1.5px solid rgba(0,0,0,0.18)',
  position: 'relative',
}
const tdStyle: React.CSSProperties = {
  padding: '8px 5px', borderBottom: '1px solid #E2E8F0',
  borderRight: '1px solid #E2E8F0', color: '#1E293B',
  whiteSpace: 'nowrap', fontFamily: "'Aptos', sans-serif", fontSize: 12,
}
