import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

// Silently re-runs `refetch` on a timer, whenever a socket notification
// arrives, and whenever the tab regains focus, so pages stay live without
// the user ever needing to manually reload.
// 8s rather than 20s because the socket push cannot be relied on: the API runs
// two PM2 cluster workers with no shared Socket.IO adapter, so a room only
// exists on the worker that holds the connection and an event emitted by the
// other worker is lost. Polling is what actually keeps pages live today.
export function useAutoRefresh(refetch: () => void, intervalMs = 8000) {
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

    return () => {
      clearInterval(interval)
      socket.off('notification', run)
      socket.off('new_message', run)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', run)
    }
  }, [intervalMs])
}
