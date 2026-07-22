import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

// Silently re-runs `refetch` on a timer, whenever a socket notification
// arrives, and whenever the tab regains focus, so pages stay live without
// the user ever needing to manually reload.
// The socket push is the fast path and lands in well under a second. Polling is
// only the safety net for a dropped connection, so 15s is plenty: shortening it
// would add constant load to buy nothing the socket does not already deliver.
//
// This only holds while the API runs as a single process. Under PM2 cluster mode
// a Socket.IO room lives on one worker, so events emitted by another worker were
// silently lost and polling was carrying the whole feature.
export function useAutoRefresh(refetch: () => void, intervalMs = 15000) {
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
