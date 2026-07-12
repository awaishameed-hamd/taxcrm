'use client'

import { P } from '@/lib/palette'

export default function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ padding: '0 20px 20px', background: P.bgMain, minHeight: '100vh' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Angelos', sans-serif", fontSize: 22, display: 'inline-block', transform: 'skewX(12deg)', color: P.navy, margin: 0 }}>
          {title}
        </h1>
      </div>
    </div>
  )
}

