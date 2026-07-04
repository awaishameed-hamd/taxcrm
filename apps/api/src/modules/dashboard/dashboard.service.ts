import { Injectable } from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(
    actorId: string,
    actorRole: Role,
    period?: string,
    fromDate?: string,
    toDate?: string,
  ) {
    return { total: 0, statusBreakdown: {}, dataAwaited: 0, inProgress: 0, underReview: 0, completed: 0, recentReturns: [], topTrainees: [] }
  }

  private buildDateFilter(period?: string, fromDate?: string, toDate?: string) {
    const now = new Date()

    if (period === 'custom' && fromDate && toDate) {
      const start = new Date(fromDate + 'T00:00:00')
      const end   = new Date(toDate + 'T23:59:59.999')
      return { gte: start, lte: end }
    }

    if (period === 'daily') {
      const start = new Date(now); start.setHours(0, 0, 0, 0)
      const end   = new Date(now); end.setHours(23, 59, 59, 999)
      return { gte: start, lte: end }
    }

    if (period === 'weekly') {
      const start = new Date(now)
      start.setDate(start.getDate() - start.getDay())
      start.setHours(0, 0, 0, 0)
      const end = new Date(now); end.setHours(23, 59, 59, 999)
      return { gte: start, lte: end }
    }

    if (period === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end   = new Date(now); end.setHours(23, 59, 59, 999)
      return { gte: start, lte: end }
    }

    return null
  }
}
