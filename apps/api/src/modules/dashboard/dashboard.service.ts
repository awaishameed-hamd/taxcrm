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

    // ── Role scoping ────────────────────────────────────────────────────────────
    // TRAINEE   → only their own assigned work
    // TEAM_LEAD → their own work + the work of trainees they lead
    // MANAGER / PARTNER / ADMIN → everything (no scope filter)
    let taxTeamFilter:    any = {}
    let fbrTeamFilter:    any = {}
    let genTeamFilter:    any = {}
    let clientTeamFilter: any = {}
    let scopedUserIds: string[] | null = null   // for team-count + leaderboard shaping

    if (actorRole === Role.TRAINEE) {
      taxTeamFilter    = { traineeId: actorId }
      fbrTeamFilter    = { assignedToId: actorId }
      genTeamFilter    = { assignedToId: actorId }
      clientTeamFilter = { traineeId: actorId }
      scopedUserIds    = [actorId]
    } else if (actorRole === Role.TEAM_LEAD) {
      const trainees = await this.prisma.user.findMany({
        where: { teamLeadId: actorId },
        select: { id: true },
      })
      const ids = [actorId, ...trainees.map(t => t.id)]
      taxTeamFilter    = { traineeId:    { in: ids } }
      fbrTeamFilter    = { OR: [{ assignedToId: { in: ids } }, { client: { traineeId: { in: ids } } }] }
      genTeamFilter    = { assignedToId: { in: ids } }
      clientTeamFilter = { traineeId:    { in: trainees.map(t => t.id) } }
      scopedUserIds    = ids
    }

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
      actorRole === Role.TEAM_LEAD
        ? this.prisma.user.count({ where: { teamLeadId: actorId } })
        : actorRole === Role.TRAINEE
          ? Promise.resolve(0)
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

    // ── Tax authority breakdown (FBR / PRA / SRB / KPRA / BRA / AJK) ───────────
    const byAuthorityRaw = await this.prisma.salesTaxTask.groupBy({
      by: ['authority'],
      where: { ...taxTeamFilter, ...createdFilter },
      _count: { id: true },
    })

    // ── Active (incomplete) returns by type, for the Active Returns card ─────
    const activeByTypeRaw = await this.prisma.salesTaxTask.groupBy({
      by: ['taskType'],
      where: { status: { not: 'COMPLETED' as any }, ...taxTeamFilter, ...createdFilter },
      _count: { id: true },
    })

    // ── Completed returns by type (respects period), for the Completed card ──
    const completedByTypeRaw = await this.prisma.salesTaxTask.groupBy({
      by: ['taskType'],
      where: { status: 'COMPLETED' as any, ...taxTeamFilter, ...(dateFilter ? { updatedAt: dateFilter } : {}) },
      _count: { id: true },
    })

    // ── Active FBR cases by tax type, for the FBR card breakdown ─────────────
    const fbrByTypeRaw = await this.prisma.fbrCase.groupBy({
      by: ['taxType'],
      where: { currentStage: { not: 'CLOSED' as any }, ...fbrTeamFilter, ...createdFilter },
      _count: { id: true },
    })

    // ── Deadline urgency, live snapshot of active tasks by due-date band ──────
    const now      = new Date()
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
    const weekEnd  = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7); weekEnd.setHours(23, 59, 59, 999)
    const activeDl = { status: { not: 'COMPLETED' as any }, ...taxTeamFilter }

    const [overdue, dueToday, dueThisWeek, upcoming, noDueDate] = await Promise.all([
      this.prisma.salesTaxTask.count({ where: { ...activeDl, dueDate: { lt: now } } }),
      this.prisma.salesTaxTask.count({ where: { ...activeDl, dueDate: { gte: now, lte: todayEnd } } }),
      this.prisma.salesTaxTask.count({ where: { ...activeDl, dueDate: { gt: todayEnd, lte: weekEnd } } }),
      this.prisma.salesTaxTask.count({ where: { ...activeDl, dueDate: { gt: weekEnd } } }),
      this.prisma.salesTaxTask.count({ where: { ...activeDl, dueDate: null } }),
    ])

    // ── Monthly filing trend (created vs completed) for current year ──────────
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const [monthCreated, monthCompleted] = await Promise.all([
      this.prisma.salesTaxTask.findMany({
        where: { createdAt: { gte: yearStart }, ...taxTeamFilter },
        select: { createdAt: true },
      }),
      this.prisma.salesTaxTask.findMany({
        where: { status: 'COMPLETED' as any, updatedAt: { gte: yearStart }, ...taxTeamFilter },
        select: { updatedAt: true },
      }),
    ])
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const monthlyTrend = MONTHS.map((m, i) => ({ month: m, created: 0, completed: 0 }))
    monthCreated.forEach(t   => { monthlyTrend[new Date(t.createdAt).getMonth()].created++ })
    monthCompleted.forEach(t => { monthlyTrend[new Date(t.updatedAt).getMonth()].completed++ })

    // ── Breakdown boxes (each shows Active + Completed/Closed) ─────────────────
    const map = (rows: any[], key: string) => rows.map(r => ({ key: r[key], count: r._count.id }))
    const completedFilter = dateFilter ? { updatedAt: dateFilter } : {}

    const [
      activeGeneral,
      salesAuthActive, salesAuthCompleted,
      fbrTypeClosed,
      fbrStageActiveRaw, fbrStageClosedRaw,
    ] = await Promise.all([
      // Active general tasks (not DONE), for the new card
      this.prisma.task.count({ where: { taxType: 'general', status: { not: 'DONE' as any }, ...genTeamFilter, ...createdFilter } }),
      // Box 2. Sales Tax returns by authority
      this.prisma.salesTaxTask.groupBy({ by: ['authority'], where: { taskType: 'SALES_TAX', status: { not: 'COMPLETED' as any }, ...taxTeamFilter, ...createdFilter }, _count: { id: true } }),
      this.prisma.salesTaxTask.groupBy({ by: ['authority'], where: { taskType: 'SALES_TAX', status: 'COMPLETED' as any, ...taxTeamFilter, ...completedFilter }, _count: { id: true } }),
      // Box 3. Closed FBR cases by tax type (active side = fbrByTypeRaw)
      this.prisma.fbrCase.groupBy({ by: ['taxType'], where: { currentStage: 'CLOSED' as any, ...fbrTeamFilter }, _count: { id: true } }),
      // Box 4. FBR cases by stage (active vs closed)
      this.prisma.fbrCase.groupBy({ by: ['currentStage'], where: { currentStage: { not: 'CLOSED' as any }, ...fbrTeamFilter, ...createdFilter }, _count: { id: true } }),
      this.prisma.fbrCase.groupBy({ by: ['currentStage'], where: { currentStage: 'CLOSED' as any, ...fbrTeamFilter }, _count: { id: true } }),
    ])

    const boxes = {
      returns:      { active: activeByTypeRaw.map(s => ({ key: s.taskType, count: s._count.id })),
                      completed: completedByTypeRaw.map(s => ({ key: s.taskType, count: s._count.id })) },
      salesByAuth:  { active: map(salesAuthActive, 'authority'), completed: map(salesAuthCompleted, 'authority') },
      fbrByType:    { active: fbrByTypeRaw.map(s => ({ key: s.taxType, count: s._count.id })),
                      completed: map(fbrTypeClosed, 'taxType') },
      fbrByStage:   { active: map(fbrStageActiveRaw, 'currentStage'), completed: map(fbrStageClosedRaw, 'currentStage') },
    }

    return {
      stats: { totalClients, activePipeline, completedInPeriod, activeFbr, activeGeneral, teamCount },
      pipelineByStatus: pipelineByStatus.map(s => ({ status: s.status,       count: s._count.id })),
      pipelineByType:   pipelineByTypeRaw.map(s => ({ type: s.taskType,       count: s._count.id })),
      fbrByStage:       fbrByStage.map(s       => ({ stage: s.currentStage,   count: s._count.id })),
      generalByStatus:  generalByStatus.map(s  => ({ status: s.status,        count: s._count.id })),
      byAuthority:      byAuthorityRaw.map(s    => ({ authority: s.authority,  count: s._count.id })),
      activeByType:     activeByTypeRaw.map(s   => ({ type: s.taskType,        count: s._count.id })),
      completedByType:  completedByTypeRaw.map(s=> ({ type: s.taskType,        count: s._count.id })),
      fbrByType:        fbrByTypeRaw.map(s      => ({ type: s.taxType,         count: s._count.id })),
      boxes,
      deadlines:        { overdue, dueToday, dueThisWeek, upcoming, noDueDate },
      monthlyTrend,
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
