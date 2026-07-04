import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Role } from '@ca-firm/shared'
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto'

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private taskSelect = {
    id: true, title: true, description: true,
    status: true, priority: true, dueDate: true,
    taxType: true, createdAt: true, updatedAt: true,
    client:      { select: { id: true, businessName: true, user: { select: { id: true, fullName: true, userCode: true } } } },
    createdBy:   { select: { id: true, fullName: true, role: true, userCode: true } },
    assignedTo:  { select: { id: true, fullName: true, role: true, userCode: true } },
  }

  // ── List tasks ────────────────────────────────────────────────────────────────
  async listTasks(userId: string, role: Role, taxType?: string, status?: string) {
    const where: any = {}

    if (role === Role.TRAINEE) {
      where.assignedToId = userId
    } else if (role === Role.MANAGER || role === Role.TEAM_LEAD) {
      where.assignedToId = userId
    }
    // ADMIN / PARTNER see everything

    if (taxType && taxType !== 'all') where.taxType = taxType
    if (status  && status !== 'ALL')  where.status  = status

    return this.prisma.task.findMany({
      where,
      select: this.taskSelect,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })
  }

  // ── Create a task ─────────────────────────────────────────────────────────────
  async createTask(creatorId: string, creatorRole: Role, dto: CreateTaskDto) {
    const assignedToId = dto.assignedToId ?? creatorId

    if (creatorRole === Role.TRAINEE && assignedToId !== creatorId) {
      throw new ForbiddenException('Trainees can only create tasks for themselves')
    }

    if ((creatorRole === Role.MANAGER || creatorRole === Role.TEAM_LEAD) && assignedToId !== creatorId) {
      const target = await this.prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true } })
      if (!target || (target.role !== Role.TRAINEE && target.role !== Role.MANAGER && target.role !== Role.TEAM_LEAD)) {
        throw new ForbiddenException('Can only assign tasks to trainees, team leads, or other managers')
      }
    }

    // Duplicate check: same client + same taxType cannot have two active tasks
    if (dto.clientId && dto.taxType && dto.taxType !== 'general') {
      const existing = await this.prisma.task.findFirst({
        where: { clientId: dto.clientId, taxType: dto.taxType, status: { in: ['TODO', 'IN_PROGRESS'] as any } },
        select: { id: true, status: true },
      })
      if (existing) {
        const label = dto.taxType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const state = existing.status === 'IN_PROGRESS' ? 'already in progress' : 'already started (pending)'
        throw new ConflictException(`A ${label} task is ${state} for this client`)
      }
    }

    const TAX_LABELS: Record<string, string> = {
      sales_tax: 'Sales Tax', income_tax: 'Income Tax', wht: 'Withholding Tax',
    }
    const autoTitle = dto.title?.trim() || (TAX_LABELS[dto.taxType ?? ''] ? `${TAX_LABELS[dto.taxType!]} Task` : 'Task')

    return this.prisma.task.create({
      data: {
        title:        autoTitle,
        description:  dto.description,
        priority:     dto.priority ?? 'MEDIUM',
        dueDate:      dto.dueDate ? new Date(dto.dueDate) : null,
        taxType:      dto.taxType ?? 'general',
        clientId:     dto.clientId ?? null,
        createdById:  creatorId,
        assignedToId,
      } as any,
      select: this.taskSelect,
    })
  }

  // ── Update a task ─────────────────────────────────────────────────────────────
  async updateTask(taskId: string, userId: string, role: Role, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new NotFoundException('Task not found')

    if (role === Role.TRAINEE) {
      if ((task as any).assignedToId !== userId) throw new ForbiddenException()
      return this.prisma.task.update({
        where: { id: taskId },
        data:  { status: dto.status } as any,
        select: this.taskSelect,
      })
    }

    if (role === Role.MANAGER || role === Role.TEAM_LEAD) {
      const t = task as any
      if (t.createdById !== userId && t.assignedToId !== userId) throw new ForbiddenException()
    }

    const data: any = {}
    if (dto.title        !== undefined) data.title        = dto.title
    if (dto.description  !== undefined) data.description  = dto.description
    if (dto.status       !== undefined) data.status       = dto.status
    if (dto.priority     !== undefined) data.priority     = dto.priority
    if (dto.dueDate      !== undefined) data.dueDate      = dto.dueDate ? new Date(dto.dueDate) : null
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId
    if (dto.taxType      !== undefined) data.taxType      = dto.taxType
    if (dto.clientId     !== undefined) data.clientId     = dto.clientId || null

    return this.prisma.task.update({ where: { id: taskId }, data, select: this.taskSelect })
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async deleteTask(taskId: string, userId: string, role: Role) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new NotFoundException('Task not found')
    if (role === Role.TRAINEE) throw new ForbiddenException('Trainees cannot delete tasks')
    if ((role === Role.MANAGER || role === Role.TEAM_LEAD) && (task as any).createdById !== userId) throw new ForbiddenException()
    await this.prisma.task.delete({ where: { id: taskId } })
    return { success: true }
  }

  // ── Assignable users dropdown ──────────────────────────────────────────────────
  async getAssignableUsers(callerId: string, callerRole: Role) {
    if (callerRole === Role.TRAINEE) {
      const me = await this.prisma.user.findUnique({ where: { id: callerId }, select: { id: true, fullName: true, role: true } })
      return me ? [me] : []
    }
    if (callerRole === Role.MANAGER || callerRole === Role.TEAM_LEAD) {
      return this.prisma.user.findMany({
        where: { role: { in: [Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] } },
        select: { id: true, fullName: true, role: true, userCode: true },
        orderBy: { fullName: 'asc' },
      })
    }
    return this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] } },
      select: { id: true, fullName: true, role: true, userCode: true },
      orderBy: { fullName: 'asc' },
    })
  }

  // ── Client dropdown ───────────────────────────────────────────────────────────
  async getClients(callerId: string, callerRole: Role) {
    const where: any = {}
    if (callerRole === Role.TRAINEE) where.traineeId = callerId
    return this.prisma.clientProfile.findMany({
      where,
      select: {
        id: true, businessName: true,
        user: { select: { id: true, fullName: true, userCode: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    })
  }
}
