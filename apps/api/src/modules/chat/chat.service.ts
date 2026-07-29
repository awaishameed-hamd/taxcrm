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

  // ── Contacts, who the current user is allowed to start a chat with ────────

  async getContacts(userId: string, role: Role) {
    let contacts: any[]

    if (role === Role.ADMIN || role === Role.PARTNER || role === Role.MANAGER || role === Role.TEAM_LEAD) {
      // The real person behind a client is their representative, so chat lists
      // representatives (portal users), never the client business login itself.
      contacts = await this.prisma.user.findMany({
        where:   { id: { not: userId }, isActive: true, role: { not: Role.CLIENT } },
        select:  CONTACT_SELECT,
        orderBy: { fullName: 'asc' },
      })
    } else if (role === Role.TRAINEE) {
      const [staff, clients] = await Promise.all([
        // Trainees can now reach every staff member, other trainees included.
        this.prisma.user.findMany({
          where:  { id: { not: userId }, role: { in: [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] }, isActive: true },
          select: CONTACT_SELECT,
        }),
        // The representatives of the clients this trainee handles (only those with
        // a portal login can be chatted with).
        this.prisma.clientProfile.findMany({
          where:  { traineeId: userId, representative: { isActive: true, userId: { not: null } } },
          select: { representative: { select: { user: { select: CONTACT_SELECT } } } },
        }),
      ])
      const reps = clients
        .map((c) => c.representative?.user)
        .filter((u): u is NonNullable<typeof u> => !!u)
      // One representative can cover several of the trainee's clients, dedupe by id.
      const seen = new Set<string>()
      const uniqueReps = reps.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
      contacts = [...staff, ...uniqueReps]
    } else if (role === Role.REPRESENTATIVE) {
      // A representative reaches the trainees handling the clients they represent,
      // plus all senior staff.
      const [staff, rep] = await Promise.all([
        this.prisma.user.findMany({
          where:  { role: { in: [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD] }, isActive: true },
          select: CONTACT_SELECT,
        }),
        this.prisma.clientRepresentative.findUnique({
          where:  { userId },
          select: { clients: { select: { trainee: { select: CONTACT_SELECT } } } },
        }),
      ])
      const trainees = (rep?.clients ?? [])
        .map((c) => c.trainee)
        .filter((u): u is NonNullable<typeof u> => !!u)
      const seen = new Set<string>()
      const uniqueTrainees = trainees.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
      contacts = [...uniqueTrainees, ...staff]
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


  // ── Group chats ────────────────────────────────────────────────────────────

  private async assertGroupAdmin(conversationId: string, userId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!p) throw new ForbiddenException('You are not part of this group')
    if (!p.isAdmin) throw new ForbiddenException('Only a group admin can do this')
  }

  async createGroup(creatorId: string, name: string, memberIds: string[]) {
    const members = Array.from(new Set((memberIds ?? []).filter((id) => id && id !== creatorId)))
    return this.prisma.conversation.create({
      data: {
        isGroup:       true,
        name:          (name ?? '').trim() || 'New Group',
        createdById:   creatorId,
        lastMessageAt: new Date(),
        participants: {
          create: [
            { userId: creatorId, isAdmin: true },
            ...members.map((id) => ({ userId: id })),
          ],
        },
      },
      include: { participants: true },
    })
  }

  async renameGroup(conversationId: string, userId: string, name: string) {
    await this.assertGroupAdmin(conversationId, userId)
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:  { name: (name ?? '').trim() || 'Group' },
    })
    return this.getGroupInfo(conversationId, userId)
  }

  async addGroupMembers(conversationId: string, userId: string, memberIds: string[]) {
    await this.assertGroupAdmin(conversationId, userId)
    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId }, select: { userId: true },
    })
    const have = new Set(existing.map((e) => e.userId))
    const toAdd = Array.from(new Set(memberIds ?? [])).filter((id) => id && !have.has(id))
    if (toAdd.length) {
      await this.prisma.conversationParticipant.createMany({
        data: toAdd.map((id) => ({ conversationId, userId: id })),
        skipDuplicates: true,
      })
    }
    return this.getGroupInfo(conversationId, userId)
  }

  async removeGroupMember(conversationId: string, userId: string, memberId: string) {
    await this.assertGroupAdmin(conversationId, userId)
    if (memberId === userId) throw new ForbiddenException('Use leave group to remove yourself')
    await this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId: memberId } })
    return this.getGroupInfo(conversationId, userId)
  }

  async leaveGroup(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, include: { participants: true },
    })
    if (!conv) throw new NotFoundException('Group not found')
    if (!conv.isGroup) throw new ForbiddenException('Not a group')

    await this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId } })
    const remaining = conv.participants.filter((p) => p.userId !== userId)

    if (remaining.length === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } })
      return { left: true, deleted: true }
    }
    // Never leave a group without an admin, promote the first remaining member.
    if (!remaining.some((p) => p.isAdmin)) {
      await this.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: remaining[0].userId } },
        data:  { isAdmin: true },
      })
    }
    return { left: true }
  }

  async getGroupInfo(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, include: { participants: true },
    })
    if (!conv) throw new NotFoundException('Group not found')
    if (!conv.participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException('You are not part of this group')
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: conv.participants.map((p) => p.userId) } }, select: CONTACT_SELECT,
    })
    const userMap = new Map(users.map((u) => [u.id, u]))
    const members = conv.participants.map((p) => {
      const u = userMap.get(p.userId)
      return { ...(u ? this.withPresence(u) : { id: p.userId, fullName: 'Unknown', role: '', avatar: null }), isAdmin: p.isAdmin }
    })
    const me = conv.participants.find((p) => p.userId === userId)
    return {
      id:          conv.id,
      name:        conv.name,
      isGroup:     conv.isGroup,
      createdById: conv.createdById,
      isAdmin:     !!me?.isAdmin,
      members,
    }
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
        NOT: { deletedForUserIds: { has: userId } },
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

  // ── Delete a single message, per user ("delete for me") ────────────────────
  // Either participant, sender or receiver, can remove a message from their own
  // view. The other side keeps it. Once everyone has deleted it, the row goes.

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where:   { id: messageId },
      include: { conversation: { select: { participants: { select: { userId: true } } } } },
    })
    if (!message) throw new NotFoundException('Message not found')

    const participantIds = message.conversation.participants.map((p) => p.userId)
    if (!participantIds.includes(userId)) throw new ForbiddenException('You are not part of this conversation')

    const deletedFor = Array.from(new Set([...message.deletedForUserIds, userId]))

    if (participantIds.every((id) => deletedFor.includes(id))) {
      await this.prisma.message.delete({ where: { id: messageId } })
    } else {
      await this.prisma.message.update({ where: { id: messageId }, data: { deletedForUserIds: deletedFor } })
    }
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

  // ── Presence, called by the gateway when a user's last socket disconnects ─

  async updateLastSeen(userId: string): Promise<Date> {
    const lastSeenAt = new Date()
    await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt } })
    return lastSeenAt
  }

  // Lightweight total for the sidebar badge, skips last-message/participant lookups
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
            NOT:            { deletedForUserIds: { has: userId } },
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
          where:   { NOT: { deletedForUserIds: { has: userId } } },
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

    // Unread count per conversation, messages from the other person since I last read
    const unreadCounts = await Promise.all(
      conversations.map(async (c) => {
        const me = c.participants.find((p) => p.userId === userId)
        const count = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId:       { not: userId },
            NOT:            { deletedForUserIds: { has: userId } },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        })
        return [c.id, count] as const
      }),
    )
    const unreadMap = new Map(unreadCounts)

    return conversations.map((c) => {
      const unreadCount = unreadMap.get(c.id) ?? 0
      if (c.isGroup) {
        return { ...c, otherUser: null, memberCount: c.participants.length, unreadCount }
      }
      const otherId  = c.participants.find((p) => p.userId !== userId)?.userId
      const otherRaw = otherId ? userMap.get(otherId) ?? null : null
      return {
        ...c,
        otherUser:   otherRaw ? this.withPresence(otherRaw) : null,
        unreadCount,
      }
    })
  }
}
