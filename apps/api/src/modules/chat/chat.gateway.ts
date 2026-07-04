import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { ChatService } from './chat.service'
import { PresenceService } from './presence.service'
import { NotificationsService } from '../notifications/notifications.service'

interface AuthenticatedSocket extends Socket {
  userId: string
  userRole: string
}

@WebSocketGateway({
  cors: {
    origin: (origin: string, cb: Function) => cb(null, true),
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server

  constructor(
    private chatService:    ChatService,
    private jwt:            JwtService,
    private config:         ConfigService,
    private presence:       PresenceService,
    private notifications:  NotificationsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth.token as string
      if (!token) throw new WsException('No token')

      const payload = this.jwt.verify(token, {
        secret: this.config.get('jwt.accessSecret'),
      }) as { sub: string; role: string }

      client.userId   = payload.sub
      client.userRole = payload.role
      client.join(`user:${payload.sub}`)

      this.presence.addSocket(payload.sub, client.id)
      this.server.emit('presence_update', { userId: payload.sub, online: true })
    } catch {
      client.disconnect()
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return
    const wentOffline = this.presence.removeSocket(client.userId, client.id)
    if (wentOffline) {
      const lastSeenAt = await this.chatService.updateLastSeen(client.userId)
      this.server.emit('presence_update', { userId: client.userId, online: false, lastSeenAt })
    }
  }

  @SubscribeMessage('join_conversation')
  async joinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.join(`conv:${data.conversationId}`)
    const lastReadAt = await this.chatService.markRead(data.conversationId, client.userId)
    this.server.to(`conv:${data.conversationId}`).emit('read_receipt', {
      conversationId: data.conversationId,
      userId:         client.userId,
      lastReadAt,
    })
    return { joined: data.conversationId }
  }

  @SubscribeMessage('send_message')
  async sendMessage(
    @MessageBody() data: { conversationId: string; content: string; type?: string; attachmentUrl?: string; replyToId?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const message = await this.chatService.saveMessage(
      data.conversationId,
      client.userId,
      data.content,
      data.type,
      data.attachmentUrl,
      data.replyToId,
    )

    // Broadcast to everyone in the conversation room
    this.server.to(`conv:${data.conversationId}`).emit('new_message', message)

    // Notify participants who are not the sender
    const participants = await this.chatService.getConversationParticipants(data.conversationId)
    const snippet = data.content?.substring(0, 80) ?? 'You have a new message'
    for (const p of participants) {
      if (p.userId === client.userId) continue
      await this.notifications.create({
        userId: p.userId,
        title:  'New Message',
        body:   snippet,
        type:   'NEW_MESSAGE',
        data:   { conversationId: data.conversationId },
      })
      this.emitToUser(p.userId, 'notification', {
        title:          'New Message',
        body:           snippet,
        conversationId: data.conversationId,
      })
    }

    return message
  }

  @SubscribeMessage('delete_message')
  async deleteMessage(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { conversationId } = await this.chatService.deleteMessage(data.messageId, client.userId)
    this.server.to(`conv:${conversationId}`).emit('message_deleted', { messageId: data.messageId, conversationId })
    return { ok: true }
  }

  @SubscribeMessage('mark_read')
  async markRead(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const lastReadAt = await this.chatService.markRead(data.conversationId, client.userId)
    this.server.to(`conv:${data.conversationId}`).emit('read_receipt', {
      conversationId: data.conversationId,
      userId:         client.userId,
      lastReadAt,
    })
    return { ok: true }
  }

  // Called by other services to push real-time notifications
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data)
  }
}
