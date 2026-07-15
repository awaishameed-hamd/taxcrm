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

  // â”€â”€ List cases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listCases(userId: string, role: Role, clientId?: string, stage?: string, taxType?: string) {
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
        noticeRounds: { select: { id: true, roundNumber: true, outcome: true } },
        appeal: { select: { id: true, outcome: true, appealType: true } },
        stayApplications: { select: { id: true, outcome: true } },
        _count: { select: { hearings: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return cases
  }

  // â”€â”€ Get single case (unchecked — for internal use after an authorized action) â”€â”€
  private async getCaseRaw(id: string) {
    const c = await this.prisma.fbrCase.findUnique({
      where:   { id },
      select: FULL_CASE_SELECT,
    })
    if (!c) throw new NotFoundException('FBR case not found')
    return c
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

  async updateNoticeRound(id: string, dto: UpdateNoticeRoundDto) {
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
      'docListApprovedById', 'internalReviewById', 'partnerApprovedById',
      'submissionMethod', 'submissionRef', 'outcome', 'challanRef', 'notes',
    ]
    for (const f of strFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f]
    }
    if (dto.adjournmentApplied !== undefined) data.adjournmentApplied = dto.adjournmentApplied
    if (dto.challanPaid        !== undefined) data.challanPaid        = dto.challanPaid

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

  async updateAppeal(id: string, dto: UpdateAppealDto) {
    const data: any = {}
    const dateFields = [
      'feePaidAt', 'groundsPreparedAt', 'internalReviewedAt', 'partnerApprovedAt',
      'submittedAt', 'orderDate', 'challanPaidAt', 'closedAt',
    ]
    for (const f of dateFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f] ? new Date((dto as any)[f]) : null
    }
    const strFields = [
      'appealType', 'feeChallanRef', 'submissionMethod', 'internalReviewById',
      'partnerApprovedById', 'submissionRef', 'outcome', 'challanRef', 'notes',
    ]
    for (const f of strFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f]
    }
    if (dto.isLate           !== undefined) data.isLate           = dto.isLate
    if (dto.condonationFiled !== undefined) data.condonationFiled = dto.condonationFiled
    if (dto.challanPaid      !== undefined) data.challanPaid      = dto.challanPaid

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

  async updateStay(id: string, dto: UpdateStayDto) {
    const data: any = {}
    const dateFields = ['reviewedAt', 'submittedAt', 'hearingDate', 'decidedAt']
    for (const f of dateFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f] ? new Date((dto as any)[f]) : null
    }
    const strFields = ['reason', 'reviewedById', 'submissionMethod', 'submissionRef', 'outcome', 'notes']
    for (const f of strFields) {
      if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f]
    }

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
  async addHearing(caseId: string, dto: AddHearingDto) {
    return this.prisma.fbrHearing.create({
      data: {
        caseId,
        appealId:     dto.appealId,
        scheduledDate: new Date(dto.scheduledDate),
        notes:        dto.notes,
      },
    })
  }

  async updateHearing(id: string, dto: UpdateHearingDto) {
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

