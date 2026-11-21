import { Injectable, OnModuleInit, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  AuditPhase, AuditEngagementStatus, AuditTaskType, AuditTeamRole,
  ReviewPointStatus, WorkingPaperStatus, Division, Role, Prisma,
} from '@prisma/client'
import {
  CreateEngagementDto, UpdateEngagementDto, SetTeamDto,
  CreateWorkingPaperDto, UpdateWorkingPaperDto, ReviewWorkingPaperDto,
  CreateReviewPointDto, RespondReviewPointDto, AddAttachmentDto,
} from './dto/audit.dto'

// The standard heads an audit file is broken into. Seeded on boot and editable
// by an admin afterwards, the same way PipelineStepConfig works for tax.
const DEFAULT_AREAS = [
  // Balance sheet
  { name: 'Property, Plant & Equipment', group: 'BALANCE_SHEET',   sortOrder: 0 },
  { name: 'Intangible Assets',           group: 'BALANCE_SHEET',   sortOrder: 1 },
  { name: 'Investments',                 group: 'BALANCE_SHEET',   sortOrder: 2 },
  { name: 'Inventory',                   group: 'BALANCE_SHEET',   sortOrder: 3 },
  { name: 'Trade Receivables',           group: 'BALANCE_SHEET',   sortOrder: 4 },
  { name: 'Cash & Bank',                 group: 'BALANCE_SHEET',   sortOrder: 5 },
  { name: 'Trade Payables',              group: 'BALANCE_SHEET',   sortOrder: 6 },
  { name: 'Loans & Borrowings',          group: 'BALANCE_SHEET',   sortOrder: 7 },
  { name: 'Taxation',                    group: 'BALANCE_SHEET',   sortOrder: 8 },
  { name: 'Equity',                      group: 'BALANCE_SHEET',   sortOrder: 9 },
  { name: 'Provisions',                  group: 'BALANCE_SHEET',   sortOrder: 10 },
  // Profit and loss
  { name: 'Revenue',                     group: 'PROFIT_AND_LOSS', sortOrder: 0 },
  { name: 'Cost of Sales',               group: 'PROFIT_AND_LOSS', sortOrder: 1 },
  { name: 'Administrative Expenses',     group: 'PROFIT_AND_LOSS', sortOrder: 2 },
  { name: 'Selling & Distribution',      group: 'PROFIT_AND_LOSS', sortOrder: 3 },
  { name: 'Finance Cost',                group: 'PROFIT_AND_LOSS', sortOrder: 4 },
  { name: 'Other Income',                group: 'PROFIT_AND_LOSS', sortOrder: 5 },
  // Everything else a file has to cover
  { name: 'Related Party Transactions',  group: 'OTHER',           sortOrder: 0 },
  { name: 'Commitments & Contingencies', group: 'OTHER',           sortOrder: 1 },
  { name: 'Subsequent Events',           group: 'OTHER',           sortOrder: 2 },
  { name: 'Going Concern',               group: 'OTHER',           sortOrder: 3 },
]

// The procedures inside a working paper. Every new paper starts with these, and
// the owner can add their own on top.
const DEFAULT_WP_STEPS = [
  'Obtain lead schedule and agree to trial balance',
  'Request supporting data from client',
  'Perform substantive testing',
  'Document findings in the working paper',
  'Self-review and conclude',
]

const ENGAGEMENT_INCLUDE = {
  client: { select: { id: true, businessName: true, user: { select: { fullName: true } } } },
  teamLead: { select: { id: true, fullName: true, userCode: true } },
  createdBy: { select: { id: true, fullName: true } },
  signedOffBy: { select: { id: true, fullName: true } },
  team: { include: { user: { select: { id: true, fullName: true, userCode: true, role: true } } } },
  attachments: { include: { uploadedBy: { select: { id: true, fullName: true } } } },
}

const WP_INCLUDE = {
  assignedTo: { select: { id: true, fullName: true, userCode: true } },
  teamLeadReviewedBy: { select: { id: true, fullName: true } },
  managerReviewedBy: { select: { id: true, fullName: true } },
  steps: { orderBy: { sortOrder: 'asc' as const } },
  reviewPoints: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      raisedBy:    { select: { id: true, fullName: true } },
      respondedBy: { select: { id: true, fullName: true } },
      clearedBy:   { select: { id: true, fullName: true } },
    },
  },
  attachments: { include: { uploadedBy: { select: { id: true, fullName: true } } } },
}

type Actor = { id: string; role: Role; division?: Division }

@Injectable()
export class AuditService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    for (const area of DEFAULT_AREAS) {
      await this.prisma.auditAreaConfig.upsert({
        where:  { name_group: { name: area.name, group: area.group as any } },
        create: { ...area, group: area.group as any },
        update: {}, // never overwrite an admin's edits
      })
    }
  }

  // ── The wall ───────────────────────────────────────────────────────────────
  // Audit is invisible to tax staff. Partner and Admin carry BOTH and see
  // everything, which is the whole reason division exists as a separate axis
  // from role.
  private assertAudit(actor: Actor) {
    if (actor.role === Role.ADMIN || actor.role === Role.PARTNER) return
    if (actor.division === Division.AUDIT || actor.division === Division.BOTH) return
    throw new ForbiddenException('Audit is not part of your department')
  }

  private isManagerOrAbove(role: Role) {
    return role === Role.ADMIN || role === Role.PARTNER || role === Role.MANAGER
  }

  // ── Areas ──────────────────────────────────────────────────────────────────
  async listAreas() {
    return this.prisma.auditAreaConfig.findMany({
      where:   { isActive: true },
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    })
  }

  // ── Engagements ────────────────────────────────────────────────────────────
  // A trainee sees only the engagements they are on. A team lead sees the ones
  // they lead plus any they are a member of. Manager and above see all audit
  // work, which is what lets a manager allocate it in the first place.
  private scopeFor(actor: Actor): Prisma.AuditEngagementWhereInput {
    if (this.isManagerOrAbove(actor.role)) return {}
    return { OR: [{ teamLeadId: actor.id }, { team: { some: { userId: actor.id } } }] }
  }

  async listEngagements(actor: Actor, taskType?: string, status?: string, clientId?: string) {
    this.assertAudit(actor)
    const engagements = await this.prisma.auditEngagement.findMany({
      where: {
        ...this.scopeFor(actor),
        ...(taskType ? { taskType: taskType as AuditTaskType } : {}),
        ...(status   ? { status: status as AuditEngagementStatus } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: {
        ...ENGAGEMENT_INCLUDE,
        workingPapers: { select: { id: true, status: true, reviewPoints: { where: { status: { not: ReviewPointStatus.CLEARED } }, select: { id: true } } } },
      },
      orderBy: [{ periodEndDate: 'desc' }, { createdAt: 'desc' }],
    })
    return engagements.map(e => this.withProgress(e))
  }

  async getEngagement(id: string, actor: Actor) {
    this.assertAudit(actor)
    const eng = await this.prisma.auditEngagement.findUnique({
      where:   { id },
      include: { ...ENGAGEMENT_INCLUDE, workingPapers: { include: WP_INCLUDE, orderBy: { createdAt: 'asc' } } },
    })
    if (!eng) throw new NotFoundException('Engagement not found')

    // A member who is not on this file has no business reading it
    if (!this.isManagerOrAbove(actor.role)) {
      const onTeam = eng.teamLeadId === actor.id || eng.team.some(t => t.userId === actor.id)
      if (!onTeam) throw new ForbiddenException('You are not on this engagement')
    }
    return this.withProgress(eng)
  }

  // Progress and the two gates, worked out here so every caller agrees on them.
  private withProgress(eng: any) {
    const papers = eng.workingPapers ?? []
    const done   = papers.filter((w: any) => w.status === WorkingPaperStatus.COMPLETED).length
    const openPoints = papers.reduce(
      (n: number, w: any) => n + (w.reviewPoints ?? []).filter((p: any) => p.status !== ReviewPointStatus.CLEARED).length, 0)

    return {
      ...eng,
      progress: { total: papers.length, completed: done, percent: papers.length ? Math.round((done / papers.length) * 100) : 0 },
      openReviewPoints: openPoints,
      // Both must be true before the engagement can be signed off
      canComplete: papers.length > 0 && done === papers.length && openPoints === 0
                   && !!eng.financialStatementsFileId && !!eng.auditReportFileId,
      blockers: [
        ...(papers.length === 0 ? ['No working papers have been created'] : []),
        ...(done < papers.length ? [`${papers.length - done} working paper(s) not completed`] : []),
        ...(openPoints > 0 ? [`${openPoints} review point(s) still open`] : []),
        ...(!eng.financialStatementsFileId ? ['Signed financial statements not attached'] : []),
        ...(!eng.auditReportFileId ? ['Audit report not attached'] : []),
      ],
    }
  }

  async createEngagement(dto: CreateEngagementDto, actor: Actor) {
    this.assertAudit(actor)
    if (!this.isManagerOrAbove(actor.role)) throw new ForbiddenException('Only a manager can raise an engagement')

    const eng = await this.prisma.auditEngagement.create({
      data: {
        taskType:      (dto.taskType ?? 'EXTERNAL_AUDIT') as AuditTaskType,
        clientId:      dto.clientId,
        title:         dto.title,
        description:   dto.description,
        periodEndDate: new Date(dto.periodEndDate),
        periodLabel:   dto.periodLabel,
        dueDate:       dto.dueDate ? new Date(dto.dueDate) : undefined,
        materiality:   dto.materiality,
        performanceMateriality: dto.performanceMateriality,
        teamLeadId:    dto.teamLeadId,
        createdById:   actor.id,
        startedAt:     new Date(),
        // The team is named at creation: the lead plus whoever else is on it
        team: {
          create: [
            ...(dto.teamLeadId ? [{ userId: dto.teamLeadId, teamRole: AuditTeamRole.TEAM_LEAD }] : []),
            ...(dto.memberIds ?? [])
              .filter(id => id !== dto.teamLeadId)
              .map(id => ({ userId: id, teamRole: AuditTeamRole.MEMBER })),
          ],
        },
      },
      include: ENGAGEMENT_INCLUDE,
    })
    return eng
  }

  async updateEngagement(id: string, dto: UpdateEngagementDto, actor: Actor) {
    this.assertAudit(actor)
    const eng = await this.prisma.auditEngagement.findUnique({ where: { id }, select: { teamLeadId: true } })
    if (!eng) throw new NotFoundException('Engagement not found')
    if (!this.isManagerOrAbove(actor.role) && eng.teamLeadId !== actor.id) {
      throw new ForbiddenException('Only the team lead or a manager can change this engagement')
    }

    return this.prisma.auditEngagement.update({
      where: { id },
      data: {
        ...(dto.title        !== undefined ? { title: dto.title } : {}),
        ...(dto.description  !== undefined ? { description: dto.description } : {}),
        ...(dto.phase        !== undefined ? { phase: dto.phase as AuditPhase } : {}),
        ...(dto.dueDate      !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.materiality  !== undefined ? { materiality: dto.materiality } : {}),
        ...(dto.performanceMateriality !== undefined ? { performanceMateriality: dto.performanceMateriality } : {}),
        ...(dto.riskAssessment !== undefined ? { riskAssessment: dto.riskAssessment } : {}),
        ...(dto.teamLeadId   !== undefined ? { teamLeadId: dto.teamLeadId } : {}),
      },
      include: ENGAGEMENT_INCLUDE,
    })
  }

  // Replaces the team outright, which is how a manager reshuffles a job.
  async setTeam(id: string, dto: SetTeamDto, actor: Actor) {
    this.assertAudit(actor)
    if (!this.isManagerOrAbove(actor.role)) throw new ForbiddenException('Only a manager can change the team')

    const members = [
      ...(dto.teamLeadId ? [{ userId: dto.teamLeadId, teamRole: AuditTeamRole.TEAM_LEAD }] : []),
      ...(dto.memberIds ?? []).filter(u => u !== dto.teamLeadId).map(u => ({ userId: u, teamRole: AuditTeamRole.MEMBER })),
    ]

    await this.prisma.$transaction([
      this.prisma.auditTeamMember.deleteMany({ where: { engagementId: id } }),
      ...members.map(m => this.prisma.auditTeamMember.create({ data: { engagementId: id, ...m } })),
      this.prisma.auditEngagement.update({ where: { id }, data: { teamLeadId: dto.teamLeadId ?? null } }),
    ])
    return this.getEngagement(id, actor)
  }

  // ── Working papers ─────────────────────────────────────────────────────────
  async createWorkingPaper(engagementId: string, dto: CreateWorkingPaperDto, actor: Actor) {
    this.assertAudit(actor)
    const eng = await this.prisma.auditEngagement.findUnique({ where: { id: engagementId }, select: { teamLeadId: true } })
    if (!eng) throw new NotFoundException('Engagement not found')
    // Allocating heads is the team lead's job, managers can do it too
    if (!this.isManagerOrAbove(actor.role) && eng.teamLeadId !== actor.id) {
      throw new ForbiddenException('Only the team lead or a manager can allocate working papers')
    }

    const area = dto.areaId
      ? await this.prisma.auditAreaConfig.findUnique({ where: { id: dto.areaId }, select: { name: true } })
      : null

    return this.prisma.auditWorkingPaper.create({
      data: {
        engagementId,
        areaId:       dto.areaId,
        areaName:     area?.name ?? dto.areaName ?? 'Untitled area',
        assignedToId: dto.assignedToId,
        dueDate:      dto.dueDate ? new Date(dto.dueDate) : undefined,
        currentYearAmount: dto.currentYearAmount,
        priorYearAmount:   dto.priorYearAmount,
        steps: { create: (dto.steps?.length ? dto.steps : DEFAULT_WP_STEPS).map((name, i) => ({ name, sortOrder: i })) },
      },
      include: WP_INCLUDE,
    })
  }

  async updateWorkingPaper(id: string, dto: UpdateWorkingPaperDto, actor: Actor) {
    this.assertAudit(actor)
    const wp = await this.prisma.auditWorkingPaper.findUnique({
      where: { id },
      include: { engagement: { select: { teamLeadId: true } } },
    })
    if (!wp) throw new NotFoundException('Working paper not found')

    const mayEdit = this.isManagerOrAbove(actor.role)
      || wp.engagement.teamLeadId === actor.id
      || wp.assignedToId === actor.id
    if (!mayEdit) throw new ForbiddenException('This working paper is not yours')

    return this.prisma.auditWorkingPaper.update({
      where: { id },
      data: {
        ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId } : {}),
        ...(dto.status       !== undefined ? { status: dto.status as WorkingPaperStatus } : {}),
        ...(dto.conclusion   !== undefined ? { conclusion: dto.conclusion } : {}),
        ...(dto.dueDate      !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.currentYearAmount !== undefined ? { currentYearAmount: dto.currentYearAmount } : {}),
        ...(dto.priorYearAmount   !== undefined ? { priorYearAmount: dto.priorYearAmount } : {}),
      },
      include: WP_INCLUDE,
    })
  }

  async deleteWorkingPaper(id: string, actor: Actor) {
    this.assertAudit(actor)
    const wp = await this.prisma.auditWorkingPaper.findUnique({
      where: { id }, include: { engagement: { select: { teamLeadId: true } } },
    })
    if (!wp) throw new NotFoundException('Working paper not found')
    if (!this.isManagerOrAbove(actor.role) && wp.engagement.teamLeadId !== actor.id) {
      throw new ForbiddenException('Only the team lead or a manager can remove a working paper')
    }
    await this.prisma.auditWorkingPaper.delete({ where: { id } })
    return { ok: true }
  }

  async toggleStep(stepId: string, isDone: boolean, notes: string | undefined, actor: Actor) {
    this.assertAudit(actor)
    const step = await this.prisma.auditWorkingPaperStep.findUnique({ where: { id: stepId } })
    if (!step) throw new NotFoundException('Step not found')

    return this.prisma.auditWorkingPaperStep.update({
      where: { id: stepId },
      data: {
        isDone,
        ...(notes !== undefined ? { notes } : {}),
        completedById: isDone ? actor.id : null,
        completedAt:   isDone ? new Date() : null,
      },
    })
  }

  // The preparer hands the paper up. Every step has to be ticked first,
  // otherwise "submitted" means nothing.
  async submitWorkingPaper(id: string, actor: Actor) {
    this.assertAudit(actor)
    const wp = await this.prisma.auditWorkingPaper.findUnique({ where: { id }, include: { steps: true } })
    if (!wp) throw new NotFoundException('Working paper not found')
    const pending = wp.steps.filter(s => !s.isDone).length
    if (pending > 0) throw new BadRequestException(`${pending} step(s) still to do on this working paper`)

    return this.prisma.auditWorkingPaper.update({
      where: { id },
      data:  { status: WorkingPaperStatus.TEAM_LEAD_REVIEW, submittedAt: new Date() },
      include: WP_INCLUDE,
    })
  }

  // Member -> Team Lead -> Manager. A reviewer cannot pass a paper up while they
  // have left review points open on it; that is what makes the points binding.
  async reviewWorkingPaper(id: string, dto: ReviewWorkingPaperDto, actor: Actor) {
    this.assertAudit(actor)
    const wp = await this.prisma.auditWorkingPaper.findUnique({
      where: { id },
      include: { engagement: { select: { teamLeadId: true } }, reviewPoints: true },
    })
    if (!wp) throw new NotFoundException('Working paper not found')

    if (dto.action === 'SEND_BACK') {
      if (!dto.reason?.trim()) throw new BadRequestException('Give a reason when sending a working paper back')
      return this.prisma.auditWorkingPaper.update({
        where: { id },
        data:  { status: WorkingPaperStatus.SENT_BACK },
        include: WP_INCLUDE,
      })
    }

    const open = wp.reviewPoints.filter(p => p.status !== ReviewPointStatus.CLEARED).length
    if (open > 0) throw new BadRequestException(`Clear the ${open} open review point(s) first`)

    // Team lead approval moves it to the manager; manager approval finishes it
    if (wp.status === WorkingPaperStatus.TEAM_LEAD_REVIEW) {
      const mayReview = this.isManagerOrAbove(actor.role) || wp.engagement.teamLeadId === actor.id
      if (!mayReview) throw new ForbiddenException('Only the team lead reviews at this stage')
      return this.prisma.auditWorkingPaper.update({
        where: { id },
        data: {
          status: WorkingPaperStatus.MANAGER_REVIEW,
          teamLeadReviewedById: actor.id, teamLeadReviewedAt: new Date(),
        },
        include: WP_INCLUDE,
      })
    }

    if (wp.status === WorkingPaperStatus.MANAGER_REVIEW) {
      if (!this.isManagerOrAbove(actor.role)) throw new ForbiddenException('Only a manager signs off at this stage')
      return this.prisma.auditWorkingPaper.update({
        where: { id },
        data: {
          status: WorkingPaperStatus.COMPLETED,
          managerReviewedById: actor.id, managerReviewedAt: new Date(),
          completedAt: new Date(),
        },
        include: WP_INCLUDE,
      })
    }

    throw new BadRequestException('This working paper is not waiting for review')
  }

  // ── Review points ──────────────────────────────────────────────────────────
  async addReviewPoint(workingPaperId: string, dto: CreateReviewPointDto, actor: Actor) {
    this.assertAudit(actor)
    const wp = await this.prisma.auditWorkingPaper.findUnique({
      where: { id: workingPaperId }, include: { engagement: { select: { teamLeadId: true } } },
    })
    if (!wp) throw new NotFoundException('Working paper not found')
    const mayRaise = this.isManagerOrAbove(actor.role) || wp.engagement.teamLeadId === actor.id
    if (!mayRaise) throw new ForbiddenException('Only a reviewer can raise a review point')

    return this.prisma.auditReviewPoint.create({
      data: { workingPaperId, raisedById: actor.id, note: dto.note },
      include: { raisedBy: { select: { id: true, fullName: true } } },
    })
  }

  // The preparer answers; the reviewer is the only one who can call it cleared.
  async respondReviewPoint(id: string, dto: RespondReviewPointDto, actor: Actor) {
    this.assertAudit(actor)
    const point = await this.prisma.auditReviewPoint.findUnique({
      where: { id },
      include: { workingPaper: { include: { engagement: { select: { teamLeadId: true } } } } },
    })
    if (!point) throw new NotFoundException('Review point not found')

    if (dto.action === 'CLEAR') {
      const mayClear = this.isManagerOrAbove(actor.role)
        || point.workingPaper.engagement.teamLeadId === actor.id
        || point.raisedById === actor.id
      if (!mayClear) throw new ForbiddenException('Only the reviewer can clear a review point')
      return this.prisma.auditReviewPoint.update({
        where: { id },
        data:  { status: ReviewPointStatus.CLEARED, clearedById: actor.id, clearedAt: new Date() },
      })
    }

    if (!dto.response?.trim()) throw new BadRequestException('Write a response')
    return this.prisma.auditReviewPoint.update({
      where: { id },
      data: {
        status: ReviewPointStatus.ANSWERED,
        response: dto.response, respondedById: actor.id, respondedAt: new Date(),
      },
    })
  }

  // ── Attachments ────────────────────────────────────────────────────────────
  // The file itself is already on B2 by the time this is called; this records
  // the reference and, for the two report kinds, releases the completion gate.
  async addAttachment(dto: AddAttachmentDto, actor: Actor) {
    this.assertAudit(actor)
    const att = await this.prisma.auditAttachment.create({
      data: {
        engagementId:   dto.engagementId,
        workingPaperId: dto.workingPaperId,
        fileName: dto.fileName, fileKey: dto.fileKey,
        fileSize: dto.fileSize, mimeType: dto.mimeType,
        kind: dto.kind, uploadedById: actor.id,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    })

    if (dto.engagementId && (dto.kind === 'FINANCIAL_STATEMENTS' || dto.kind === 'AUDIT_REPORT')) {
      await this.prisma.auditEngagement.update({
        where: { id: dto.engagementId },
        data: dto.kind === 'FINANCIAL_STATEMENTS'
          ? { financialStatementsFileId: att.id }
          : { auditReportFileId: att.id },
      })
    }
    return att
  }

  async removeAttachment(id: string, actor: Actor) {
    this.assertAudit(actor)
    const att = await this.prisma.auditAttachment.findUnique({ where: { id } })
    if (!att) throw new NotFoundException('Attachment not found')

    // Removing one of the two report files closes the gate again
    if (att.engagementId) {
      await this.prisma.auditEngagement.updateMany({
        where: { id: att.engagementId, financialStatementsFileId: id },
        data:  { financialStatementsFileId: null },
      })
      await this.prisma.auditEngagement.updateMany({
        where: { id: att.engagementId, auditReportFileId: id },
        data:  { auditReportFileId: null },
      })
    }
    await this.prisma.auditAttachment.delete({ where: { id } })
    return { ok: true }
  }

  // ── Sign off ───────────────────────────────────────────────────────────────
  async signOff(id: string, actor: Actor) {
    this.assertAudit(actor)
    if (!this.isManagerOrAbove(actor.role)) throw new ForbiddenException('Only a manager or partner can sign off')

    const eng = await this.getEngagement(id, actor)
    if (!eng.canComplete) {
      throw new BadRequestException(`Cannot complete yet. ${eng.blockers.join('. ')}.`)
    }

    return this.prisma.auditEngagement.update({
      where: { id },
      data: {
        status: AuditEngagementStatus.COMPLETED,
        phase:  AuditPhase.COMPLETED,
        completedAt: new Date(),
        signedOffById: actor.id, signedOffAt: new Date(),
      },
      include: ENGAGEMENT_INCLUDE,
    })
  }

  async sendBack(id: string, reason: string, actor: Actor) {
    this.assertAudit(actor)
    if (!this.isManagerOrAbove(actor.role)) throw new ForbiddenException('Only a manager or partner can send an engagement back')
    if (!reason?.trim()) throw new BadRequestException('Give a reason')

    return this.prisma.auditEngagement.update({
      where: { id },
      data:  { status: AuditEngagementStatus.SENT_BACK, sentBackReason: reason, phase: AuditPhase.FIELDWORK },
      include: ENGAGEMENT_INCLUDE,
    })
  }

  // ── Summary for the page header ────────────────────────────────────────────
  async summary(actor: Actor) {
    this.assertAudit(actor)
    const where = this.scopeFor(actor)
    const [total, inProgress, completed, sentBack] = await Promise.all([
      this.prisma.auditEngagement.count({ where }),
      this.prisma.auditEngagement.count({ where: { ...where, status: AuditEngagementStatus.IN_PROGRESS } }),
      this.prisma.auditEngagement.count({ where: { ...where, status: AuditEngagementStatus.COMPLETED } }),
      this.prisma.auditEngagement.count({ where: { ...where, status: AuditEngagementStatus.SENT_BACK } }),
    ])
    const myPapers = await this.prisma.auditWorkingPaper.count({
      where: { assignedToId: actor.id, status: { notIn: [WorkingPaperStatus.COMPLETED] } },
    })
    return { total, inProgress, completed, sentBack, myOpenWorkingPapers: myPapers }
  }

  // Who a manager or team lead can put on an audit team: audit staff only.
  async assignableStaff() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] },
        division: { in: [Division.AUDIT, Division.BOTH] },
      },
      select: { id: true, fullName: true, userCode: true, role: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    })
  }
}
