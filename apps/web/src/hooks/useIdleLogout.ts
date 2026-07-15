'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const IDLE_LIMIT_MS  = 5 * 60 * 1000 // 5 minutes of no interaction
const RESET_THROTTLE  = 1000          // don't rearm the timer more than once/sec
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export function useIdleLogout() {
  const { isAuthenticated, logout } = useAuth()
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastResetRef = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return

    const doLogout = () => {
      logout().finally(() => { window.location.href = '/login?reason=inactivity' })
    }

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(doLogout, IDLE_LIMIT_MS)
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastResetRef.current < RESET_THROTTLE) return
      lastResetRef.current = now
      arm()
    }

    arm()
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity))
    }
  }, [isAuthenticated, logout])
}
