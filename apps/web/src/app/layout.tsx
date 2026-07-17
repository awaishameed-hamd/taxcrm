import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Asif Associates',
  description: 'Centralized tax return management for CA firms',
}

// Without this a phone renders the page at ~980px and zooms out, which is why
// the CRM used to arrive as a shrunken desktop screen. userScalable stays on so
// rotating or pinching a wide table is still possible.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.cdnfonts.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/ethnocentric" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
