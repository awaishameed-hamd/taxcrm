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
    const createdFilter = dateFilter ? { createdAt: dateFilter } : {}

    // For Team Lead: scope everything to their team (trainees under them)
    let teamTraineeIds: string[] | null = null
    if (actorRole === Role.TEAM_LEAD) {
      const trainees = await this.prisma.user.findMany({
        where: { teamLeadId: actorId },
        select: { id: true },
      })
      teamTraineeIds = trainees.map(t => t.id)
    }
    const taxTeamFilter:  any = teamTraineeIds !== null ? { traineeId: { in: teamTraineeIds } } : {}
    const fbrTeamFilter:  any = teamTraineeIds !== null ? { client: { traineeId: { in: teamTraineeIds } } } : {}
    const genTeamFilter:  any = teamTraineeIds !== null ? { assignedToId: { in: [actorId, ...teamTraineeIds] } } : {}
    const clientTeamFilter: any = teamTraineeIds !== null ? { traineeId: { in: teamTraineeIds } } : {}

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
      this.prisma.clientProfile.count({ where: clientTeamFilter }),

      this.prisma.salesTaxTask.count({
        where: { status: { not: 'COMPLETED' as any }, ...taxTeamFilter, ...createdFilter },
      }),

      this.prisma.salesTaxTask.count({
        where: {
          status: 'COMPLETED' as any,
          ...taxTeamFilter,
          ...(dateFilter ? { updatedAt: dateFilter } : {}),
        },
      }),

      this.prisma.fbrCase.count({
        where: { currentStage: { not: 'CLOSED' as any }, ...fbrTeamFilter, ...createdFilter },
      }),

      // Team Lead sees their trainee count; others see all team members
      teamTraineeIds !== null
        ? this.prisma.user.count({ where: { teamLeadId: actorId } })
        : this.prisma.user.count({ where: { role: { in: [Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] as any } } }),

      this.prisma.salesTaxTask.groupBy({
        by: ['status'],
        where: { ...taxTeamFilter, ...createdFilter },
        _count: { id: true },
      }),

      this.prisma.salesTaxTask.groupBy({
        by: ['taskType'],
        where: { ...taxTeamFilter, ...createdFilter },
        _count: { id: true },
      }),

      this.prisma.fbrCase.groupBy({
        by: ['currentStage'],
        where: { ...fbrTeamFilter, ...createdFilter },
        _count: { id: true },
      }),

      this.prisma.task.groupBy({
        by: ['status'],
        where: { taxType: 'general', ...genTeamFilter, ...createdFilter },
        _count: { id: true },
      }),
    ])

    // ── 7-day completion trend ────────────────────────────────────────────────
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const [recentCompleted, recentCreated] = await Promise.all([
      this.prisma.salesTaxTask.findMany({
        where: { status: 'COMPLETED' as any, updatedAt: { gte: sevenDaysAgo }, ...taxTeamFilter },
        select: { updatedAt: true },
      }),
      this.prisma.salesTaxTask.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, ...taxTeamFilter },
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

    // ── Trainee leaderboard ───────────────────────────────────────────────────
    const completedWhere: any = { status: 'COMPLETED', ...taxTeamFilter }
    if (dateFilter) completedWhere.updatedAt = dateFilter
    const [completedForLeaderboard, pendingForLeaderboard] = await Promise.all([
      this.prisma.salesTaxTask.findMany({
        where: completedWhere,
        select: { traineeId: true, trainee: { select: { fullName: true } } },
      }),
      this.prisma.salesTaxTask.findMany({
        where: { status: { not: 'COMPLETED' as any }, ...taxTeamFilter, ...createdFilter },
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

    // ── Recent pipeline tasks ─────────────────────────────────────────────────
    const recentTasks = await this.prisma.salesTaxTask.findMany({
      take: 6,
      where: { ...taxTeamFilter, ...createdFilter },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, taskType: true, status: true, dueDate: true, createdAt: true,
        client:  { select: { businessName: true, user: { select: { fullName: true } } } },
        trainee: { select: { fullName: true } },
      },
    })

    // ── Recent FBR cases ──────────────────────────────────────────────────────
    const recentFbr = await this.prisma.fbrCase.findMany({
      take: 5,
      where: { ...fbrTeamFilter, ...createdFilter },
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
