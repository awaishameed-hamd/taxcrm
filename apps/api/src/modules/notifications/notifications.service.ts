import { Injectable } from '@nestjs/common'
import { NotificationType } from '@ca-firm/shared'
import { PrismaService } from '../prisma/prisma.service'

interface CreateNotificationDto {
  userId: string
  title:  string
  body:   string
  type:   string
  data?:  Record<string, unknown>
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title:  dto.title,
        body:   dto.body,
        type:   dto.type as NotificationType,
        data:   dto.data as any,
      },
    })
  }

  async findForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where:   { userId, ...(unreadOnly && { isRead: false }) },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data:  { isRead: true },
    })
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true },
    })
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } })
  }
}
