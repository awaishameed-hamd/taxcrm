import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Role } from '@ca-firm/shared'
import { CreateLeaveDto } from './dto/create-leave.dto'

// Who can approve whose leave
const CAN_APPROVE: Record<string, string[]> = {
  [Role.PARTNER]: [Role.TRAINEE, Role.TEAM_LEAD, Role.MANAGER],
  [Role.ADMIN]:   [Role.TRAINEE, Role.TEAM_LEAD, Role.MANAGER, Role.PARTNER],
  [Role.MANAGER]: [Role.TRAINEE, Role.TEAM_LEAD],
}

function calcDays(from: string, to: string): number {
  const f = new Date(from), t = new Date(to)
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1)
}

@Injectable()
export class LeavesService {
  constructor(private prisma: PrismaService) {}

  async apply(applicantId: string, dto: CreateLeaveDto) {
    if (dto.fromDate > dto.toDate)
      throw new BadRequestException('From date must be before or equal to To date')

    return this.prisma.leaveApplication.create({
      data: {
        applicantId,
        leaveType: dto.leaveType,
        fromDate:  new Date(dto.fromDate),
        toDate:    new Date(dto.toDate),
        days:      calcDays(dto.fromDate, dto.toDate),
        reason:    dto.reason,
      },
    })
  }

  async getMyLeaves(applicantId: string) {
    return this.prisma.leaveApplication.findMany({
      where:   { applicantId },
      orderBy: { createdAt: 'desc' },
      include: { reviewedBy: { select: { fullName: true, role: true } } },
    })
  }

  async getPending(actorRole: string) {
    const approvableRoles = CAN_APPROVE[actorRole] ?? []
    if (!approvableRoles.length) return []

    return this.prisma.leaveApplication.findMany({
      where: {
        status:    'pending',
        applicant: { role: { in: approvableRoles as any } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        applicant:  { select: { fullName: true, role: true, userCode: true } },
        reviewedBy: { select: { fullName: true } },
      },
    })
  }

  async getAll(actorRole: string) {
    const approvableRoles = CAN_APPROVE[actorRole] ?? []
    if (!approvableRoles.length) return []

    return this.prisma.leaveApplication.findMany({
      where:   { applicant: { role: { in: approvableRoles as any } } },
      orderBy: { createdAt: 'desc' },
      include: {
        applicant:  { select: { fullName: true, role: true, userCode: true } },
        reviewedBy: { select: { fullName: true } },
      },
    })
  }

  async approve(id: string, actorId: string, actorRole: string) {
    const leave = await this.prisma.leaveApplication.findUnique({
      where:   { id },
      include: { applicant: { select: { role: true } } },
    })
    if (!leave) throw new NotFoundException('Leave application not found')
    if (leave.status !== 'pending') throw new BadRequestException('Already reviewed')

    const approvableRoles = CAN_APPROVE[actorRole] ?? []
    if (!approvableRoles.includes(leave.applicant.role as string))
      throw new ForbiddenException('Not authorised to approve this leave')

    return this.prisma.leaveApplication.update({
      where: { id },
      data:  { status: 'approved', reviewedById: actorId, reviewedAt: new Date() },
    })
  }

  async reject(id: string, actorId: string, actorRole: string, reason?: string) {
    const leave = await this.prisma.leaveApplication.findUnique({
      where:   { id },
      include: { applicant: { select: { role: true } } },
    })
    if (!leave) throw new NotFoundException('Leave application not found')
    if (leave.status !== 'pending') throw new BadRequestException('Already reviewed')

    const approvableRoles = CAN_APPROVE[actorRole] ?? []
    if (!approvableRoles.includes(leave.applicant.role as string))
      throw new ForbiddenException('Not authorised to reject this leave')

    return this.prisma.leaveApplication.update({
      where: { id },
      data:  { status: 'rejected', reviewedById: actorId, reviewedAt: new Date(), rejectionReason: reason ?? null },
    })
  }
}
