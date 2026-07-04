import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Asif Associates CRM',
  description: 'Centralized tax return management for CA firms',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/ethnocentric" />
      </head>
      <body>{children}</body>
    </html>
  )
}
