import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Role } from '@ca-firm/shared'
import {
  CreateFbrCaseDto,
  UpdateFbrCaseDto,
  CreateNoticeRoundDto,
  UpdateNoticeRoundDto,
  CreateAppealDto,
  UpdateAppealDto,
  CreateStayDto,
  UpdateStayDto,
  AddHearingDto,
  UpdateHearingDto,
  CreateNoticeSectionDto,
} from './dto/fbr.dto'

// Review/approval steps in the FBR workflow are Manager+ or Partner+ tier decisions ,
// a Trainee must never be able to complete these themselves, no matter what the client sends.
const MANAGER_TIER: Role[] = [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD]
const PARTNER_TIER: Role[] = [Role.ADMIN, Role.PARTNER]

function assertRoleTier(actorRole: Role | string | undefined, tier: Role[], action: string) {
  if (!actorRole || !tier.includes(actorRole as Role)) {
    throw new ForbiddenException(`Only ${tier.includes(Role.TEAM_LEAD) ? 'a Manager or Team Lead' : 'a Partner'} can ${action}`)
  }
}

const CASE_SELECT = {
  id: true,
  caseNumber: true,
  entryPoint: true,
  currentStage: true,
  taxType: true,
  taxYear: true,
  noticeSection: true,
  noticeNumber: true,
  description: true,
  authority: true,
  closedAt: true,
  closedReason: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: {
      id: true,
      businessName: true,
      ntn: true,
      user: { select: { id: true, fullName: true, userCode: true } },
    },
  },
  assignedTo: { select: { id: true, fullName: true, role: true } },
  createdBy:  { select: { id: true, fullName: true, role: true } },
}

const FULL_CASE_SELECT = {
  ...CASE_SELECT,
  noticeRounds: {
    orderBy: { roundNumber: 'asc' as const },
    include: { attachments: true },
  },
  appeal: { include: { hearings: true, attachments: true } },
  stayApplications: {
    orderBy: { createdAt: 'asc' as const },
    include: { attachments: true },
  },
  hearings: { orderBy: { scheduledDate: 'asc' as const } },
}

@Injectable()
export class FbrService {
  constructor(private prisma: PrismaService) {}

  // â”€â”€ Case number generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async nextCaseNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const key  = `fbr:${year}`
    const counter = await this.prisma.sequenceCounter.upsert({
      where:  { key },
      update: { value: { increment: 1 } },
      create: { key, value: 1 },
    })
    return `FBR-${year}-${String(counter.value).padStart(4, '0')}`
  }

  // â”€â”€ Which tier is the case currently waiting on (for the "Task Approval" queue) â”€â”€
  private computeAwaitingRole(c: any): 'TRAINEE' | 'MANAGER' | 'PARTNER' | null {
    if (c.currentStage === 'CLOSED' || c.currentStage === 'HIGHER_FORUM') return null

    if (c.currentStage === 'STAY') {
      const stays = c.stayApplications ?? []
      const stay = [...stays].reverse().find((s: any) => s.outcome === 'PENDING') ?? stays[stays.length - 1]
      if (!stay) return null
      if (!stay.reviewedAt) return 'MANAGER'
      if (!stay.submittedAt) return 'TRAINEE'
      if (stay.outcome === 'PENDING') return 'MANAGER'
      return null
    }

    if (c.currentStage === 'APPEAL') {
      const a = c.appeal
      if (!a) return null
      if (a.isLate && !a.condonationFiled) return 'TRAINEE'
      if (!a.groundsPreparedAt) return 'TRAINEE'
      if (!a.internalReviewedAt) return 'MANAGER'
      if (!a.partnerApprovedAt) return 'PARTNER'
      if (!a.submittedAt) return 'TRAINEE'
      if ((a.hearings?.length ?? 0) === 0) return 'MANAGER'
      if (a.outcome === 'PENDING') return 'MANAGER'
      return null
    }

    // NOTICE
    const rounds = c.noticeRounds ?? []
    const r = rounds[rounds.length - 1]
    if (!r) return null
    if (!r.noticeDate) return 'TRAINEE'
    if (!r.docListCreatedAt) return 'TRAINEE'
    if (!r.docListApprovedAt) return 'MANAGER'
    if (!r.draftPreparedAt) return 'TRAINEE'
    if (!r.internalReviewedAt) return 'MANAGER'
    if (!r.partnerApprovedAt) return 'PARTNER'
    if (!r.submittedAt) return 'TRAINEE'
    if (r.outcome === 'PENDING') return 'MANAGER'
    return null
  }

  // â”€â”€ List cases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listCases(userId: string, role: Role, clientId?: string, stage?: string, taxType?: string, view?: string) {
    const where: any = {}

    if (clientId) where.clientId = clientId
    if (stage && stage !== 'ALL') where.currentStage = stage
    if (taxType && taxType !== 'ALL') where.taxType = taxType

    if (role === Role.TRAINEE) {
      where.assignedToId = userId
    } else if (role === Role.TEAM_LEAD) {
      const myTrainees = await this.prisma.user.findMany({
        where: { teamLeadId: userId },
        select: { id: true },
      })
      where.assignedToId = { in: [userId, ...myTrainees.map(t => t.id)] }
    }

    const cases = await this.prisma.fbrCase.findMany({
      where,
      select: {
        ...CASE_SELECT,
        noticeRounds: { select: {
          id: true, roundNumber: true, outcome: true, noticeDate: true, docListCreatedAt: true,
          docListApprovedAt: true, draftPreparedAt: true, internalReviewedAt: true, partnerApprovedAt: true, submittedAt: true,
        } },
        appeal: { select: {
          id: true, outcome: true, appealType: true, isLate: true, condonationFiled: true, groundsPreparedAt: true,
          internalReviewedAt: true, partnerApprovedAt: true, submittedAt: true, hearings: { select: { id: true } },
        } },
        stayApplications: { select: { id: true, outcome: true, reviewedAt: true, submittedAt: true } },
        _count: { select: { hearings: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const withAwaiting = cases.map(c => ({ ...c, awaitingRole: this.computeAwaitingRole(c) }))

    // "approval" queue: only cases genuinely waiting on a tier this role can act on
    if (view === 'approval' && role !== Role.TRAINEE) {
      const canAct = PARTNER_TIER.includes(role) ? ['MANAGER', 'PARTNER'] : ['MANAGER']
      return withAwaiting.filter(c => c.awaitingRole && canAct.includes(c.awaitingRole))
    }

    return withAwaiting
  }

  // â”€â”€ Get single case (unchecked, for internal use after an authorized action) â”€â”€
  private async getCaseRaw(id: string) {
    const c = await this.prisma.fbrCase.findUnique({
      where:   { id },
      select: FULL_CASE_SELECT,
    })
    if (!c) throw new NotFoundException('FBR case not found')
    return this.attachActors(c)
  }

  // Every step-completion field stores only a raw userId; resolve them all in one
  // batch query so the UI can show who actually did each step instead of just their role.
  private readonly ACTOR_ID_FIELDS = [
    'noticeLoggedById', 'adjournmentAppliedById', 'docListCreatedById', 'docListApprovedById', 'draftPreparedById',
    'internalReviewById', 'partnerApprovedById', 'submittedById', 'outcomeById',
    'condonationFiledById', 'groundsPreparedById', 'reviewedById', 'resumedById', 'createdById',
  ]

  private async attachActors<T extends { noticeRounds?: any[]; appeal?: any; stayApplications?: any[]; hearings?: any[] }>(c: T) {
    const ids = new Set<string>()
    const collect = (obj: any) => {
      if (!obj) return
      for (const f of this.ACTOR_ID_FIELDS) if (obj[f]) ids.add(obj[f])
    }
    for (const r of c.noticeRounds ?? []) collect(r)
    collect(c.appeal)
    for (const s of c.stayApplications ?? []) collect(s)
    for (const h of c.hearings ?? []) collect(h)
    for (const h of c.appeal?.hearings ?? []) collect(h)

    if (ids.size === 0) return { ...c, actors: {} as Record<string, { id: string; fullName: string; role: string }> }

    const users = await this.prisma.user.findMany({
      where:  { id: { in: [...ids] } },
      select: { id: true, fullName: true, role: true },
    })
    const actors = Object.fromEntries(users.map(u => [u.id, u]))
    return { ...c, actors }
  }

  // â”€â”€ Get single case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getCase(id: string, userId: string, role: Role) {
    const c = await this.getCaseRaw(id)

    const assignedToId = c.assignedTo?.id
    if (role === Role.TRAINEE) {
      if (assignedToId !== userId) throw new ForbiddenException('Access denied')
    } else if (role === Role.TEAM_LEAD) {
      const myTrainees = await this.prisma.user.findMany({ where: { teamLeadId: userId }, select: { id: true } })
      const allowed = new Set([userId, ...myTrainees.map(t => t.id)])
      if (!assignedToId || !allowed.has(assignedToId)) throw new ForbiddenException('Access denied')
    }

    return c
  }

  // â”€â”€ Create case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async createCase(dto: CreateFbrCaseDto, creatorId: string) {
    const caseNumber = await this.nextCaseNumber()

    const entryPoint = dto.entryPoint as any
    // Determine initial stage from entry point
    let currentStage: any = 'NOTICE'
    if (entryPoint === 'DIRECT_APPEAL' || entryPoint === 'HEARING_ONLY') {
      currentStage = 'APPEAL'
    }

    const c = await this.prisma.fbrCase.create({
      data: {
        caseNumber,
        clientId:    dto.clientId,
        entryPoint,
        currentStage,
        taxType:       dto.taxType,
        taxYear:       dto.taxYear,
        noticeSection: dto.noticeSection,
        noticeNumber:  dto.noticeNumber,
        description: dto.description,
        authority:    dto.authority || 'FBR',
        assignedToId: dto.assignedToId,
        createdById:  creatorId,
      },
      select: FULL_CASE_SELECT,
    })

    // Auto-create first notice round for notice entry points
    if (entryPoint === 'FRESH_NOTICE' || entryPoint === 'FURTHER_NOTICE_ONLY') {
      await this.prisma.fbrNoticeRound.create({
        data: {
          caseId:      c.id,
          roundNumber: 1,
        },
      })
    }

    // Auto-create appeal record for appeal entry points
    if (entryPoint === 'DIRECT_APPEAL' || entryPoint === 'HEARING_ONLY') {
      await this.prisma.fbrAppeal.create({
        data: {
          caseId:     c.id,
          appealType: 'CIR_APPEALS',
        },
      })
    }

    return this.getCaseRaw(c.id)
  }

  // â”€â”€ Update case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async updateCase(id: string, dto: UpdateFbrCaseDto) {
    const data: any = {}
    if (dto.taxYear       !== undefined) data.taxYear       = dto.taxYear
    if (dto.noticeSection !== undefined) data.noticeSection = dto.noticeSection
    if (dto.noticeNumber  !== undefined) data.noticeNumber  = dto.noticeNumber
    if (dto.description   !== undefined) data.description   = dto.description
    if (dto.assignedToId  !== undefined) data.assignedToId  = dto.assignedToId || null
    if (dto.currentStage  !== undefined) data.currentStage  = dto.currentStage

    return this.prisma.fbrCase.update({ where: { id }, data, select: FULL_CASE_SELECT })
  }

  // â”€â”€ Close case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async closeCase(id: string, reason: string) {
    return this.prisma.fbrCase.update({
      where: { id },
      data:  { currentStage: 'CLOSED', closedAt: new Date(), closedReason: reason },
      select: FULL_CASE_SELECT,
    })
  }

  async reopenCase(id: string) {
    return this.prisma.fbrCase.update({
      where: { id },
      data:  { currentStage: 'NOTICE', closedAt: null, closedReason: null },
      select: FULL_CASE_SELECT,
    })
  }

  async deleteCase(id: string) {
    return this.prisma.fbrCase.delete({ where: { id } })
  }

  // â”€â”€ Notice Rounds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async addNoticeRound(caseId: string, dto: CreateNoticeRoundDto) {
    const last = await this.prisma.fbrNoticeRound.findFirst({
      where: { caseId }, orderBy: { roundNumber: 'desc' }, select: { roundNumber: true },
    })
    const roundNumber = (last?.roundNumber ?? 0) + 1

    const round = await this.prisma.fbrNoticeRound.create({
      data: {
        caseId,
        roundNumber,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
      },
      include: { attachments: true },
    })

    await this.prisma.fbrCase.update({
      where: { id: caseId },
      data:  { currentStage: 'NOTICE' },
    })

    return round
  }

  async updateNoticeRound(id: string, dto: UpdateNoticeRoundDto, actorId: string, actorRole: Role) {
    // Manager+ tier: doc-list approval, internal review, and the FBR outcome decision.
    // Logging the notice as received is a Trainee-tier action, the Trainee is the one who sees the notice.
    if (dto.docListApprovedAt !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'approve the document list')
    if (dto.internalReviewedAt !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'mark the internal review done')
    if (dto.outcome !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'record the FBR outcome')
    // Partner+ tier: final sign-off
    if (dto.partnerApprovedAt !== undefined) assertRoleTier(actorRole, PARTNER_TIER, 'give final approval')

    const data: any = {}
    const dateFields = [
      'noticeDate', 'dueDate', 'adjournmentDate', 'docListCreatedAt', 'docListApprovedAt',
      'draftPreparedAt', 'internalReviewedAt', 'partnerApprovedAt',
      'submittedAt', 'orderDate', 'challanPaidAt', 'closedAt',
    ]
    for (const f of dateFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f] ? new Date((dto as any)[f]) : null
    }
    const strFields = [
      'submissionMethod', 'submissionRef', 'outcome', 'challanRef', 'notes',
    ]
    for (const f of strFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f]
    }
    // Who actually did each step is always the caller, never trust a client-supplied id
    if (dto.noticeDate          !== undefined) data.noticeLoggedById   = dto.noticeDate          ? actorId : null
    if (dto.docListCreatedAt    !== undefined) data.docListCreatedById = dto.docListCreatedAt     ? actorId : null
    if (dto.docListApprovedAt   !== undefined) data.docListApprovedById = dto.docListApprovedAt   ? actorId : null
    if (dto.draftPreparedAt     !== undefined) data.draftPreparedById  = dto.draftPreparedAt       ? actorId : null
    if (dto.internalReviewedAt  !== undefined) data.internalReviewById  = dto.internalReviewedAt  ? actorId : null
    if (dto.partnerApprovedAt   !== undefined) data.partnerApprovedById = dto.partnerApprovedAt    ? actorId : null
    if (dto.submittedAt         !== undefined) data.submittedById      = dto.submittedAt           ? actorId : null
    if (dto.outcome             !== undefined) data.outcomeById        = (dto.outcome && dto.outcome !== 'PENDING') ? actorId : null
    if (dto.adjournmentApplied !== undefined) { data.adjournmentApplied = dto.adjournmentApplied; data.adjournmentAppliedById = dto.adjournmentApplied ? actorId : null }
    if (dto.challanPaid        !== undefined) data.challanPaid        = dto.challanPaid
    // Re-doing any step that a send-back could have targeted clears the "returned" banner
    if (dto.docListCreatedAt !== undefined || dto.draftPreparedAt !== undefined || dto.internalReviewedAt !== undefined) data.sentBackComment = null

    const round = await this.prisma.fbrNoticeRound.update({
      where: { id }, data, include: { attachments: true },
    })

    // If outcome is ORDER_AGAINST â†’ move case to APPEAL stage if no appeal yet
    if (dto.outcome === 'ORDER_AGAINST') {
      const existing = await this.prisma.fbrAppeal.findUnique({ where: { caseId: round.caseId } })
      if (!existing) {
        await this.prisma.fbrAppeal.create({ data: { caseId: round.caseId, appealType: 'CIR_APPEALS' } })
      }
    }

    return round
  }

  // Manager/Partner rejects a step and returns it to whichever step it came from
  private readonly NOTICE_SEND_BACK: Record<string, { clear: string[]; tier: Role[] }> = {
    approve: { clear: ['docListCreatedAt', 'docListCreatedById'],   tier: MANAGER_TIER },
    review:  { clear: ['draftPreparedAt', 'draftPreparedById'],     tier: MANAGER_TIER },
    partner: { clear: ['internalReviewedAt', 'internalReviewById'], tier: PARTNER_TIER },
  }

  async sendBackNoticeRound(id: string, step: string, comment: string, actorRole: Role) {
    const cfg = this.NOTICE_SEND_BACK[step]
    if (!cfg) throw new ForbiddenException('This step cannot be sent back')
    assertRoleTier(actorRole, cfg.tier, 'send this step back')

    const data: any = { sentBackComment: comment.trim() }
    for (const f of cfg.clear) data[f] = null

    return this.prisma.fbrNoticeRound.update({ where: { id }, data, include: { attachments: true } })
  }

  // â”€â”€ Appeal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async createAppeal(caseId: string, dto: CreateAppealDto) {
    const appeal = await this.prisma.fbrAppeal.create({
      data: {
        caseId,
        appealType:  (dto.appealType as any) ?? 'CIR_APPEALS',
        isLate:      dto.isLate ?? false,
        notes:       dto.notes,
      },
      include: { hearings: true, attachments: true },
    })

    await this.prisma.fbrCase.update({
      where: { id: caseId },
      data:  { currentStage: 'APPEAL' },
    })

    return appeal
  }

  async updateAppeal(id: string, dto: UpdateAppealDto, actorId: string, actorRole: Role) {
    // Manager+ tier: internal review and the appeal outcome decision
    if (dto.internalReviewedAt !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'mark the appeal internal review done')
    if (dto.outcome !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'record the appeal outcome')
    // Partner+ tier: final sign-off
    if (dto.partnerApprovedAt !== undefined) assertRoleTier(actorRole, PARTNER_TIER, 'give final approval on the appeal')

    const data: any = {}
    const dateFields = [
      'feePaidAt', 'groundsPreparedAt', 'internalReviewedAt', 'partnerApprovedAt',
      'submittedAt', 'orderDate', 'challanPaidAt', 'closedAt',
    ]
    for (const f of dateFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f] ? new Date((dto as any)[f]) : null
    }
    const strFields = [
      'appealType', 'feeChallanRef', 'submissionMethod',
      'submissionRef', 'outcome', 'challanRef', 'notes',
    ]
    for (const f of strFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f]
    }
    // Who actually did each step is always the caller, never trust a client-supplied id
    if (dto.groundsPreparedAt !== undefined) data.groundsPreparedById = dto.groundsPreparedAt ? actorId : null
    if (dto.internalReviewedAt !== undefined) data.internalReviewById  = dto.internalReviewedAt ? actorId : null
    if (dto.partnerApprovedAt  !== undefined) data.partnerApprovedById = dto.partnerApprovedAt   ? actorId : null
    if (dto.submittedAt        !== undefined) data.submittedById       = dto.submittedAt          ? actorId : null
    if (dto.outcome            !== undefined) data.outcomeById         = (dto.outcome && dto.outcome !== 'PENDING') ? actorId : null
    if (dto.isLate           !== undefined) data.isLate           = dto.isLate
    if (dto.condonationFiled !== undefined) { data.condonationFiled = dto.condonationFiled; data.condonationFiledById = dto.condonationFiled ? actorId : null }
    if (dto.challanPaid      !== undefined) data.challanPaid      = dto.challanPaid
    // Re-doing any step that a send-back could have targeted clears the "returned" banner
    if (dto.groundsPreparedAt !== undefined || dto.internalReviewedAt !== undefined) data.sentBackComment = null

    const appeal = await this.prisma.fbrAppeal.update({
      where: { id }, data, include: { hearings: true, attachments: true },
    })

    // If outcome is HIGHER_FORUM â†’ update case stage
    if (dto.outcome === 'HIGHER_FORUM') {
      await this.prisma.fbrCase.update({
        where: { id: appeal.caseId },
        data:  { currentStage: 'HIGHER_FORUM' },
      })
    }

    return appeal
  }

  private readonly APPEAL_SEND_BACK: Record<string, { clear: string[]; tier: Role[] }> = {
    review:  { clear: ['groundsPreparedAt', 'groundsPreparedById'],   tier: MANAGER_TIER },
    partner: { clear: ['internalReviewedAt', 'internalReviewById'],   tier: PARTNER_TIER },
  }

  async sendBackAppeal(id: string, step: string, comment: string, actorRole: Role) {
    const cfg = this.APPEAL_SEND_BACK[step]
    if (!cfg) throw new ForbiddenException('This step cannot be sent back')
    assertRoleTier(actorRole, cfg.tier, 'send this step back')

    const data: any = { sentBackComment: comment.trim() }
    for (const f of cfg.clear) data[f] = null

    return this.prisma.fbrAppeal.update({ where: { id }, data, include: { hearings: true, attachments: true } })
  }

  // â”€â”€ Stay Application â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async createStay(caseId: string, dto: CreateStayDto) {
    const stay = await this.prisma.fbrStayApplication.create({
      data: {
        caseId,
        reason: dto.reason,
        notes:  dto.notes,
      },
      include: { attachments: true },
    })

    await this.prisma.fbrCase.update({
      where: { id: caseId },
      data:  { currentStage: 'STAY' },
    })

    return stay
  }

  async updateStay(id: string, dto: UpdateStayDto, actorId: string, actorRole: Role) {
    // Manager+ tier: reviewing the stay application and deciding its outcome
    if (dto.reviewedAt !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'mark the stay application reviewed')
    if (dto.outcome    !== undefined) assertRoleTier(actorRole, MANAGER_TIER, 'record the stay application outcome')

    const data: any = {}
    const dateFields = ['reviewedAt', 'submittedAt', 'hearingDate', 'decidedAt']
    for (const f of dateFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f] ? new Date((dto as any)[f]) : null
    }
    const strFields = ['reason', 'submissionMethod', 'submissionRef', 'outcome', 'notes']
    for (const f of strFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f]
    }
    // Who actually did each step is always the caller, never trust a client-supplied id
    if (dto.reviewedAt !== undefined) data.reviewedById = dto.reviewedAt ? actorId : null
    if (dto.submittedAt !== undefined) data.submittedById = dto.submittedAt ? actorId : null
    if (dto.outcome !== undefined) data.outcomeById = (dto.outcome && dto.outcome !== 'PENDING') ? actorId : null

    return this.prisma.fbrStayApplication.update({ where: { id }, data, include: { attachments: true } })
  }

  async resumeFromStay(stayId: string, userId: string) {
    const stay = await this.prisma.fbrStayApplication.update({
      where: { id: stayId },
      data:  { resumedAt: new Date(), resumedById: userId },
    })

    // Determine what stage to return to (NOTICE or APPEAL)
    const fbrCase = await this.prisma.fbrCase.findUnique({
      where:  { id: stay.caseId },
      select: { appeal: { select: { id: true } } },
    })

    const returnStage = fbrCase?.appeal ? 'APPEAL' : 'NOTICE'
    await this.prisma.fbrCase.update({
      where: { id: stay.caseId },
      data:  { currentStage: returnStage },
    })

    return this.getCaseRaw(stay.caseId)
  }

  // â”€â”€ Hearings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async addHearing(caseId: string, dto: AddHearingDto, actorId: string, actorRole: Role) {
    assertRoleTier(actorRole, MANAGER_TIER, 'schedule a hearing date')
    return this.prisma.fbrHearing.create({
      data: {
        caseId,
        appealId:     dto.appealId,
        scheduledDate: new Date(dto.scheduledDate),
        notes:        dto.notes,
        createdById:  actorId,
      },
    })
  }

  async updateHearing(id: string, dto: UpdateHearingDto, actorRole: Role) {
    assertRoleTier(actorRole, MANAGER_TIER, 'update a hearing')
    const data: any = {}
    if (dto.scheduledDate !== undefined) data.scheduledDate = new Date(dto.scheduledDate)
    if (dto.adjournedTo   !== undefined) data.adjournedTo   = dto.adjournedTo ? new Date(dto.adjournedTo) : null
    if (dto.outcome       !== undefined) data.outcome       = dto.outcome
    if (dto.notes         !== undefined) data.notes         = dto.notes

    return this.prisma.fbrHearing.update({ where: { id }, data })
  }

  // â”€â”€ Clients for dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getClients(userId: string, role: Role) {
    const where: any = {}
    if (role === Role.TRAINEE) where.traineeId = userId

    return this.prisma.clientProfile.findMany({
      where,
      select: {
        id: true,
        businessName: true,
        ntn: true,
        user: { select: { id: true, fullName: true, userCode: true } },
      },
      orderBy: { businessName: 'asc' },
    })
  }

  // â”€â”€ Notice Sections (admin-managed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listNoticeSections(taxType?: string) {
    return this.prisma.fbrNoticeSection.findMany({
      where: { ...(taxType ? { taxType } : {}), isActive: true },
      orderBy: [{ taxType: 'asc' }, { sortOrder: 'asc' }],
    })
  }

  async createNoticeSection(dto: CreateNoticeSectionDto) {
    return this.prisma.fbrNoticeSection.upsert({
      where: { taxType_section: { taxType: dto.taxType, section: dto.section } },
      create: { taxType: dto.taxType, section: dto.section, sortOrder: dto.sortOrder ?? 0, isActive: true },
      update: { isActive: true, sortOrder: dto.sortOrder ?? 0 },
    })
  }

  async deleteNoticeSection(id: string) {
    return this.prisma.fbrNoticeSection.update({ where: { id }, data: { isActive: false } })
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  async addAttachment(type: 'noticeRound' | 'appeal' | 'stay', parentId: string, url: string, label: string | undefined, userId: string) {
    return this.prisma.fbrAttachment.create({
      data: {
        url,
        label,
        uploadedById: userId,
        ...(type === 'noticeRound' ? { noticeRoundId: parentId } : {}),
        ...(type === 'appeal'      ? { appealId:       parentId } : {}),
        ...(type === 'stay'        ? { stayId:          parentId } : {}),
      },
    })
  }

  async deleteAttachment(id: string) {
    return this.prisma.fbrAttachment.delete({ where: { id } })
  }
}

