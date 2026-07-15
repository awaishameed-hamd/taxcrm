import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { Role } from '@ca-firm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PresenceService } from './presence.service'

const CONTACT_SELECT = { id: true, fullName: true, role: true, avatar: true, lastSeenAt: true }

@Injectable()
export class ChatService {
  private readonly uploadDir: string

  constructor(
    private prisma:   PrismaService,
    private config:   ConfigService,
    private presence: PresenceService,
  ) {
    this.uploadDir = path.join(this.config.get<string>('upload.dir') ?? './uploads', 'chat')
    fs.mkdirSync(this.uploadDir, { recursive: true })
  }

  // Attaches a live isOnline flag derived from the in-memory socket registry
  private withPresence<T extends { id: string }>(u: T): T & { isOnline: boolean } {
    return { ...u, isOnline: this.presence.isOnline(u.id) }
  }

  // ── Contacts — who the current user is allowed to start a chat with ────────

  async getContacts(userId: string, role: Role) {
    let contacts: any[]

    if (role === Role.ADMIN || role === Role.PARTNER || role === Role.MANAGER || role === Role.TEAM_LEAD) {
      contacts = await this.prisma.user.findMany({
        where:   { id: { not: userId }, isActive: true },
        select:  CONTACT_SELECT,
        orderBy: { fullName: 'asc' },
      })
    } else if (role === Role.TRAINEE) {
      const [staff, clients] = await Promise.all([
        this.prisma.user.findMany({
          where:  { role: { in: [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD] }, isActive: true },
          select: CONTACT_SELECT,
        }),
        this.prisma.clientProfile.findMany({
          where:  { traineeId: userId },
          select: { user: { select: CONTACT_SELECT } },
        }),
      ])
      contacts = [...staff, ...clients.map((c) => c.user)]
    } else {
      // CLIENT
      const [staff, profile] = await Promise.all([
        this.prisma.user.findMany({
          where:  { role: { in: [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD] }, isActive: true },
          select: CONTACT_SELECT,
        }),
        this.prisma.clientProfile.findUnique({
          where:   { userId },
          include: { trainee: { select: CONTACT_SELECT } },
        }),
      ])
      contacts = profile?.trainee ? [profile.trainee, ...staff] : staff
    }

    return contacts.map((c) => this.withPresence(c))
  }

  // ── Direct (standalone) conversation between two users ─────────────────────

  async getOrCreateDirectConversation(userIdA: string, userIdB: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: userIdA } } },
          { participants: { some: { userId: userIdB } } },
        ],
      },
      include: { participants: true },
    })

    if (existing && existing.participants.length === 2) return existing

    return this.prisma.conversation.create({
      data: {
        participants: { create: [{ userId: userIdA }, { userId: userIdB }] },
      },
      include: { participants: true },
    })
  }


  async getMessages(conversationId: string, userId: string, before?: string, limit = 50) {
    const conversation = await this.prisma.conversation.findUnique({
      where:  { id: conversationId },
      select: { participants: { select: { userId: true } } },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    const isParticipant = conversation.participants.some((p) => p.userId === userId)
    if (!isParticipant) throw new ForbiddenException('You are not part of this conversation')

    return this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      include: {
        sender:  { select: { id: true, fullName: true, role: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    })
  }

  async saveMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type = 'TEXT',
    attachmentUrl?: string,
    replyToId?: string,
  ) {
    const msg = await this.prisma.message.create({
      data: { conversationId, senderId, content, type: type as any, attachmentUrl, replyToId },
      include: {
        sender:  { select: { id: true, fullName: true, role: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, fullName: true } } } },
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:  { lastMessageAt: new Date(), updatedAt: new Date() },
    })

    return msg
  }

  // ── Delete a single message (only the sender may delete their own) ────────

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } })
    if (!message) throw new NotFoundException('Message not found')
    if (message.senderId !== userId) throw new ForbiddenException('You can only delete your own messages')

    await this.prisma.message.delete({ where: { id: messageId } })
    return { conversationId: message.conversationId }
  }

  // ── File upload for chat attachments ────────────────────────────────────────

  async uploadAttachment(file: Express.Multer.File) {
    const ext      = path.extname(file.originalname) || this.extensionForMime(file.mimetype)
    const fileName = `${uuidv4()}${ext}`
    const filePath = path.join(this.uploadDir, fileName)
    fs.writeFileSync(filePath, file.buffer)

    const isImage = file.mimetype.startsWith('image/')
    const isAudio = file.mimetype.startsWith('audio/')
    return {
      url:      `/uploads/chat/${fileName}`,
      type:     isImage ? 'IMAGE' : isAudio ? 'AUDIO' : 'FILE',
      fileName: file.originalname,
      mimeType: file.mimetype,
      size:     file.size,
    }
  }

  // Voice recordings come from MediaRecorder with no real filename/extension
  private extensionForMime(mimeType: string): string {
    if (mimeType.includes('webm')) return '.webm'
    if (mimeType.includes('ogg'))  return '.ogg'
    if (mimeType.includes('mp4'))  return '.m4a'
    if (mimeType.includes('wav'))  return '.wav'
    return ''
  }

  // ── Delete a conversation (only a participant may delete it) ───────────────

  async deleteConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where:   { id: conversationId },
      include: { participants: true },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')

    const isParticipant = conversation.participants.some((p) => p.userId === userId)
    if (!isParticipant) throw new ForbiddenException('You are not part of this conversation')

    await this.prisma.conversation.delete({ where: { id: conversationId } })
    return { message: 'Conversation deleted' }
  }

  async markRead(conversationId: string, userId: string): Promise<Date> {
    const lastReadAt = new Date()
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data:  { lastReadAt },
    })
    return lastReadAt
  }

  async getConversationParticipants(conversationId: string): Promise<{ userId: string }[]> {
    const conv = await this.prisma.conversation.findUnique({
      where:   { id: conversationId },
      select:  { participants: { select: { userId: true } } },
    })
    return conv?.participants ?? []
  }

  // ── Presence — called by the gateway when a user's last socket disconnects ─

  async updateLastSeen(userId: string): Promise<Date> {
    const lastSeenAt = new Date()
    await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt } })
    return lastSeenAt
  }

  // Lightweight total for the sidebar badge — skips last-message/participant lookups
  async getUnreadCount(userId: string) {
    const participations = await this.prisma.conversationParticipant.findMany({
      where:  { userId },
      select: { conversationId: true, lastReadAt: true },
    })
    const counts = await Promise.all(
      participations.map(p =>
        this.prisma.message.count({
          where: {
            conversationId: p.conversationId,
            senderId:       { not: userId },
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    )
    return counts.reduce((sum, c) => sum + c, 0)
  }

  async getConversationsByUser(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        messages: {
          take:    1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, fullName: true } } },
        },
        participants: { select: { userId: true, lastReadAt: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    // Attach the "other" participant's user info for direct chats
    const allOtherIds = conversations
      .flatMap((c) => c.participants.map((p) => p.userId))
      .filter((id) => id !== userId)

    const users = await this.prisma.user.findMany({
      where:  { id: { in: allOtherIds } },
      select: CONTACT_SELECT,
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    // Unread count per conversation — messages from the other person since I last read
    const unreadCounts = await Promise.all(
      conversations.map(async (c) => {
        const me = c.participants.find((p) => p.userId === userId)
        const count = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId:       { not: userId },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        })
        return [c.id, count] as const
      }),
    )
    const unreadMap = new Map(unreadCounts)

    return conversations.map((c) => {
      const otherId  = c.participants.find((p) => p.userId !== userId)?.userId
      const otherRaw = otherId ? userMap.get(otherId) ?? null : null
      return {
        ...c,
        otherUser:   otherRaw ? this.withPresence(otherRaw) : null,
        unreadCount: unreadMap.get(c.id) ?? 0,
      }
    })
  }
}
