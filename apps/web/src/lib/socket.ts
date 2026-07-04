import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket && socket.connected) return socket

  const url   = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000'
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null

  socket = io(`${url}/chat`, {
    auth:               { token },
    transports:         ['websocket'],
    reconnection:       true,
    reconnectionDelay:  1000,
  })

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
