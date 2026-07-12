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
    const dateFilter = this.buildDateFilter(period, fromDate, toDate)

    // When a period is selected, filter tasks by createdAt within that range.
    // "Overall" has no filter — all-time data.
    const createdFilter = dateFilter ? { createdAt: dateFilter } : {}

    // ── Parallel counts ───────────────────────────────────────────────────────
    const [
      totalClients,
      activePipeline,
      completedInPeriod,
      activeFbr,
      teamCount,
      pipelineByStatus,
      pipelineByTypeRaw,
      fbrByStage,
      generalByStatus,
    ] = await Promise.all([
      // Total clients is always all-time (not period-sensitive)
      this.prisma.clientProfile.count(),

      // Active pipeline: tasks that are NOT completed, filtered by createdAt in period
      this.prisma.salesTaxTask.count({
        where: { status: { not: 'COMPLETED' as any }, ...createdFilter },
      }),

      // Completed in this period: status=COMPLETED, filter by updatedAt (when it was completed)
      this.prisma.salesTaxTask.count({
        where: {
          status: 'COMPLETED' as any,
          ...(dateFilter ? { updatedAt: dateFilter } : {}),
        },
      }),

      // Active FBR cases: not CLOSED, filtered by createdAt in period
      this.prisma.fbrCase.count({
        where: { currentStage: { not: 'CLOSED' as any }, ...createdFilter },
      }),

      // Team count is always all-time
      this.prisma.user.count({
        where: { role: { in: [Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] as any } },
      }),

      // Pipeline status distribution — filtered by createdAt
      this.prisma.salesTaxTask.groupBy({
        by: ['status'],
        where: createdFilter,
        _count: { id: true },
      }),

      // Pipeline type distribution — filtered by createdAt
      this.prisma.salesTaxTask.groupBy({
        by: ['taskType'],
        where: createdFilter,
        _count: { id: true },
      }),

      // FBR cases by stage — filtered by createdAt
      this.prisma.fbrCase.groupBy({
        by: ['currentStage'],
        where: createdFilter,
        _count: { id: true },
      }),

      // General tasks by status — filtered by createdAt
      this.prisma.task.groupBy({
        by: ['status'],
        where: { taxType: 'general', ...createdFilter },
        _count: { id: true },
      }),
    ])

    // ── 7-day completion trend (always last 7 calendar days) ─────────────────
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const [recentCompleted, recentCreated] = await Promise.all([
      this.prisma.salesTaxTask.findMany({
        where: { status: 'COMPLETED' as any, updatedAt: { gte: sevenDaysAgo } },
        select: { updatedAt: true },
      }),
      this.prisma.salesTaxTask.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
    ])

    const trendMap = new Map<string, number>()
    const newMap   = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
      const key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      trendMap.set(key, 0)
      newMap.set(key, 0)
    }
    recentCompleted.forEach(t => {
      const key = new Date(t.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + 1)
    })
    recentCreated.forEach(t => {
      const key = new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      if (newMap.has(key)) newMap.set(key, (newMap.get(key) ?? 0) + 1)
    })
    const trend = [...trendMap.keys()].map(date => ({
      date,
      completed: trendMap.get(date) ?? 0,
      created:   newMap.get(date) ?? 0,
    }))

    // ── Trainee performance: completed + pending per trainee ─────────────────
    const completedWhere: any = { status: 'COMPLETED' }
    if (dateFilter) completedWhere.updatedAt = dateFilter
    const [completedForLeaderboard, pendingForLeaderboard] = await Promise.all([
      this.prisma.salesTaxTask.findMany({
        where: completedWhere,
        select: { traineeId: true, trainee: { select: { fullName: true } } },
      }),
      this.prisma.salesTaxTask.findMany({
        where: { status: { not: 'COMPLETED' as any }, ...createdFilter },
        select: { traineeId: true, trainee: { select: { fullName: true } } },
      }),
    ])

    const traineeMap = new Map<string, { name: string; completed: number; pending: number }>()
    completedForLeaderboard.forEach(t => {
      const e = traineeMap.get(t.traineeId)
      if (e) e.completed++
      else traineeMap.set(t.traineeId, { name: t.trainee?.fullName ?? 'Unknown', completed: 1, pending: 0 })
    })
    pendingForLeaderboard.forEach(t => {
      const e = traineeMap.get(t.traineeId)
      if (e) e.pending++
      else traineeMap.set(t.traineeId, { name: t.trainee?.fullName ?? 'Unknown', completed: 0, pending: 1 })
    })
    const topTrainees = [...traineeMap.values()]
      .sort((a, b) => (b.completed + b.pending) - (a.completed + a.pending))
      .slice(0, 8)

    // ── Recent pipeline tasks (period-aware) ──────────────────────────────────
    const recentTasks = await this.prisma.salesTaxTask.findMany({
      take: 6,
      where: createdFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, taskType: true, status: true, dueDate: true, createdAt: true,
        client:  { select: { businessName: true, user: { select: { fullName: true } } } },
        trainee: { select: { fullName: true } },
      },
    })

    // ── Recent FBR cases (period-aware) ──────────────────────────────────────
    const recentFbr = await this.prisma.fbrCase.findMany({
      take: 5,
      where: createdFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, caseNumber: true, currentStage: true, taxType: true, createdAt: true,
        client: { select: { businessName: true, user: { select: { fullName: true } } } },
      },
    })

    return {
      stats: { totalClients, activePipeline, completedInPeriod, activeFbr, teamCount },
      pipelineByStatus: pipelineByStatus.map(s => ({ status: s.status,       count: s._count.id })),
      pipelineByType:   pipelineByTypeRaw.map(s => ({ type: s.taskType,       count: s._count.id })),
      fbrByStage:       fbrByStage.map(s       => ({ stage: s.currentStage,   count: s._count.id })),
      generalByStatus:  generalByStatus.map(s  => ({ status: s.status,        count: s._count.id })),
      trend,
      topTrainees,
      recentTasks,
      recentFbr,
    }
  }

  private buildDateFilter(period?: string, fromDate?: string, toDate?: string) {
    const now = new Date()

    if (period === 'custom' && fromDate && toDate) {
      return { gte: new Date(fromDate + 'T00:00:00'), lte: new Date(toDate + 'T23:59:59.999') }
    }
    if (period === 'daily') {
      const s = new Date(now); s.setHours(0, 0, 0, 0)
      const e = new Date(now); e.setHours(23, 59, 59, 999)
      return { gte: s, lte: e }
    }
    if (period === 'weekly') {
      const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0)
      return { gte: s, lte: now }
    }
    if (period === 'monthly') {
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: now }
    }
    return null
  }
}
