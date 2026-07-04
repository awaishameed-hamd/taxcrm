import { Injectable } from '@nestjs/common'

// Tracks which users currently have an open socket connection.
// A user can have multiple sockets (multiple tabs/devices) — they only
// go "offline" once the last one disconnects.
@Injectable()
export class PresenceService {
  private online = new Map<string, Set<string>>()

  addSocket(userId: string, socketId: string) {
    if (!this.online.has(userId)) this.online.set(userId, new Set())
    this.online.get(userId)!.add(socketId)
  }

  // Returns true if this disconnect took the user fully offline
  removeSocket(userId: string, socketId: string): boolean {
    const set = this.online.get(userId)
    if (!set) return false
    set.delete(socketId)
    if (set.size === 0) {
      this.online.delete(userId)
      return true
    }
    return false
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId)
  }
}
