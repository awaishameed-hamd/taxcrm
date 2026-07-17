'use client'

import { useEffect, useState } from 'react'

/**
 * The app styles nearly everything with inline style objects, which no
 * stylesheet media query can reach. Responsive layout therefore has to be
 * decided in JS and fed back into those style objects — that's what this is for.
 *
 * Starts false on the server and on the first client render so markup matches
 * and hydration stays quiet; the real value lands in the effect straight after.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Phone, portrait or landscape. Sidebar goes off-canvas below this width. */
export const usePhone = () => useMediaQuery('(max-width: 639px)')

/** Tablet portrait through small landscape. */
export const useTablet = () => useMediaQuery('(min-width: 640px) and (max-width: 1023px)')

/** Anything narrower than a desktop window — phone or tablet. */
export const useCompact = () => useMediaQuery('(max-width: 1023px)')
