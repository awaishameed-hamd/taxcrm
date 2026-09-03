'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { uploadFile } from '@/lib/storage'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import {
  NAVY, TEAL, F, STATUS_META, PAYMENT_METHODS, METHOD_LABEL, loadImage,
  RANGES, rangeBounds, StatCard, blankAdj, adjNum, adjTotal, money, fmtDate,
  iso, inputStyle, labelStyle, btn, eyeBtn, pencilBtn, eyeIcon, pencilIcon,
  balanceOf, dueOf,
} from './invoiceShared'
import type { RangeKey, Invoice, Adj } from './invoiceShared'

export default function PaymentView({ payment, onClose, onEdit }: { payment: any; onClose: () => void; onEdit: () => void }) {
  const line = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${P.gridLine}` }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', fontFamily: F }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', fontFamily: F, textAlign: 'right' }}>{value}</span>
    </div>
  )
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ background: P.teal, padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 800, color: '#F1F5F9', margin: 0 }}>
            {payment.paymentNumber ?? 'Payment'}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onEdit} style={{ cursor: 'pointer', color: '#E2E8F0', fontWeight: 700, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontFamily: F }}>Edit</button>
            <button onClick={onClose} style={{ cursor: 'pointer', color: '#E2E8F0', fontWeight: 700, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontFamily: F }}>Close</button>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {line('Amount Received', money(payment.amount))}
          {line('Method', METHOD_LABEL[payment.method] ?? payment.method)}
          {line('Date', fmtDate(payment.paidAt))}
          {line('Reference', payment.reference || '-')}
          {line('Unapplied', money(payment.unapplied))}
          {payment.bonus > 0 && line('Kept as bonus', money(payment.bonus))}
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#94A3B8', fontFamily: F, margin: '16px 0 6px' }}>APPLIED TO</div>
          {(payment.allocations ?? []).length === 0
            ? <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontFamily: F }}>Nothing yet, this is sitting as credit.</p>
            : payment.allocations.map((a: any) => line(a.invoice?.invoiceNumber ?? '', money(a.amount)))}
          {payment.notes && <p style={{ margin: '14px 0 0', fontSize: 12, color: '#64748B', fontFamily: F, lineHeight: 1.5 }}>{payment.notes}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Invoice view / print ─────────────────────────────────────────────────────
