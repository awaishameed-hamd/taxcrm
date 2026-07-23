import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

// The manual refresh button dispatches this. Every mounted useAutoRefresh
// listens, so one button refetches whatever page is on screen, and only that
// page, without a full browser reload.
export const APP_REFRESH_EVENT = 'app:refresh'

// Silently re-runs `refetch` on a timer, whenever a socket notification
// arrives, and whenever the tab regains focus, so pages stay live without
// the user ever needing to manually reload.
// The socket push is the fast path and lands in well under a second. Polling
// still matters for the many changes that emit no notification (a task step
// advancing, a client edit), so 10s keeps those feeling live. At ~30 users the
// worst case is roughly 15 simple queries a second, which is negligible.
//
// This relies on the API running as a single process. Under PM2 cluster mode a
// Socket.IO room lives on one worker, so events emitted by another worker were
// silently lost and polling was carrying the whole feature.
export function useAutoRefresh(refetch: () => void, intervalMs = 10000) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    const run = () => refetchRef.current()

    const interval = setInterval(run, intervalMs)

    const socket = getSocket()
    socket.on('notification', run)
    socket.on('new_message', run)

    const onVisible = () => { if (!document.hidden) run() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', run)
    window.addEventListener(APP_REFRESH_EVENT, run)

    return () => {
      clearInterval(interval)
      socket.off('notification', run)
      socket.off('new_message', run)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', run)
      window.removeEventListener(APP_REFRESH_EVENT, run)
    }
  }, [intervalMs])
}
