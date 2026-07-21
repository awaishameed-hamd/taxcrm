'use client'

import { P } from '@/lib/palette'

export default function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ padding: '0 20px 20px', background: P.bgMain, minHeight: '100vh' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Faster One', cursive", fontSize: 26, display: 'inline-block', color: '#1E8496', margin: 0 }}>
          {title}
        </h1>
      </div>
    </div>
  )
}

