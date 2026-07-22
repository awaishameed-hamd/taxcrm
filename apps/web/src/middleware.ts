import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS  = ['/login', '/set-password', '/forgot-password']
const ROLE_PREFIXES: Record<string, string> = {
  ADMIN:     '/admin',
  PARTNER:   '/partner',
  MANAGER:   '/manager',
  TEAM_LEAD: '/team-lead',
  TRAINEE:   '/trainee',
  CLIENT:    '/client',
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Token is in sessionStorage (client-side only), so we can't read it in middleware.
  // We rely on client-side AuthContext to redirect, middleware just ensures the / root redirects.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
