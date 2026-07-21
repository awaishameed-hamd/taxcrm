import { Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SalesTaxTaskStatus, Role } from '@prisma/client'
import { AdvanceTaskDto } from './dto/advance-task.dto'
import { ManagerApproveDto, ManagerSendBackDto } from './dto/manager-action.dto'
import { PipelineStepsService } from '../pipeline-steps/pipeline-steps.service'
import { NotificationsService } from '../notifications/notifications.service'
import { ChatGateway } from '../chat/chat.gateway'
import { FbrService } from '../fbr/fbr.service'
import { InvoicesService } from '../invoices/invoices.service'
import { Role as StaffRole } from '@ca-firm/shared'

// Steps that only the assigned trainee can advance
const TRAINEE_STEPS: SalesTaxTaskStatus[] = [
  SalesTaxTaskStatus.DATA_COLLECTION,
  SalesTaxTaskStatus.DRAFT_PREPARATION,
  SalesTaxTaskStatus.CLIENT_REVIEW,
  SalesTaxTaskStatus.ANNEXURE_UPLOAD,
  SalesTaxTaskStatus.CHALLAN_GENERATED,
  SalesTaxTaskStatus.FILED,
]

// Steps that only manager can advance
const MANAGER_STEPS: SalesTaxTaskStatus[] = [
  SalesTaxTaskStatus.INCHARGE_REVIEW,
]

// What comes next in the pipeline
const NEXT_STATUS: Partial<Record<SalesTaxTaskStatus, SalesTaxTaskStatus>> = {
  [SalesTaxTaskStatus.DATA_COLLECTION]:   SalesTaxTaskStatus.DRAFT_PREPARATION,
  [SalesTaxTaskStatus.DRAFT_PREPARATION]: SalesTaxTaskStatus.CLIENT_REVIEW,
  [SalesTaxTaskStatus.CLIENT_REVIEW]:     SalesTaxTaskStatus.ANNEXURE_UPLOAD,
  [SalesTaxTaskStatus.ANNEXURE_UPLOAD]:   SalesTaxTaskStatus.INCHARGE_REVIEW,
  [SalesTaxTaskStatus.INCHARGE_REVIEW]:   SalesTaxTaskStatus.CHALLAN_GENERATED,
  [SalesTaxTaskStatus.CHALLAN_GENERATED]: SalesTaxTaskStatus.FILED,
  [SalesTaxTaskStatus.SUBMISSION_APPROVAL]: SalesTaxTaskStatus.FILED,
  [SalesTaxTaskStatus.FILED]:             SalesTaxTaskStatus.COMPLETED,
}

const TASK_INCLUDE = {
  client: {
    include: {
      user: { select: { id: true, fullName: true, userCode: true, email: true } },
    },
  },
  trainee: { select: { id: true, fullName: true, userCode: true } },
  history: {
    include: { actedBy: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  customSteps: {
    where: { isDeleted: false },
    orderBy: { createdAt: 'asc' as const },
  },
}

@Injectable()
export class SalesTaxTasksService {
  constructor(
    private prisma:         PrismaService,
    private pipelineSteps:  PipelineStepsService,
    private notifications:  NotificationsService,
    private chatGateway:    ChatGateway,
    private fbrService:     FbrService,
    private invoices:       InvoicesService,
  ) {}

  // ── List tasks, role-filtered ──────────────────────────────────────────────

  async listForTrainee(traineeId: string, status?: string, taskType?: string) {
    return this.prisma.salesTaxTask.findMany({
      where: {
        traineeId,
        ...(taskType ? { taskType } : {}),
        ...(status ? { status: status as SalesTaxTaskStatus } : {}),
      },
      include: TASK_INCLUDE,
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    })
  }

  async listForManager(status?: string, taskType?: string, userId?: string, role?: string) {
    const managerStatuses = [
      SalesTaxTaskStatus.INCHARGE_REVIEW,
      SalesTaxTaskStatus.SENT_BACK,
      SalesTaxTaskStatus.COMPLETED,
    ]
    const teamFilter = role === 'TEAM_LEAD' && userId ? { trainee: { teamLeadId: userId } } : {}
    return this.prisma.salesTaxTask.findMany({
      where: {
        ...(taskType ? { taskType } : {}),
        ...(status ? { status: status as SalesTaxTaskStatus } : { status: { in: managerStatuses } }),
        ...teamFilter,
      },
      include: TASK_INCLUDE,
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    })
  }

  async listAll(taskType?: string, userId?: string, role?: string) {
    const teamFilter = role === 'TEAM_LEAD' && userId ? { trainee: { teamLeadId: userId } } : {}
    return this.prisma.salesTaxTask.findMany({
      where: {
        status: { notIn: [SalesTaxTaskStatus.COMPLETED] },
        ...(taskType ? { taskType } : {}),
        ...teamFilter,
      },
      include: TASK_INCLUDE,
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    })
  }

  async getOne(id: string) {
    const task = await this.prisma.salesTaxTask.findUnique({ where: { id }, include: TASK_INCLUDE })
    if (!task) throw new NotFoundException('Task not found')
    return task
  }

  // ── Trainee: advance to next step ───────────────────────────────────────────

  async advanceByTrainee(taskId: string, userId: string, dto: AdvanceTaskDto) {
    const task = await this.getOne(taskId)

    if (task.traineeId !== userId)
      throw new ForbiddenException('This task is not assigned to you')

    // CLIENT_REVIEW can also be advanced by manager, handled separately
    if (!TRAINEE_STEPS.includes(task.status))
      throw new ForbiddenException('This step requires manager action')

    // Find next status, skipping over any skipped steps
    let next: SalesTaxTaskStatus | undefined = NEXT_STATUS[task.status]
    while (next && (task.skippedSteps as string[]).includes(next)) {
      next = NEXT_STATUS[next]
    }
    if (!next) throw new BadRequestException('Task is already completed')

    // Block if pending custom steps exist at this position
    const pendingCustom = await this.prisma.salesTaxCustomStep.findFirst({
      where: { taskId, insertAfter: task.status, isCompleted: false, isDeleted: false },
    })
    if (pendingCustom) throw new BadRequestException('Complete all custom steps before advancing to the next step')

    // Step-specific field updates
    const updates: Record<string, any> = {}
    if (task.status === SalesTaxTaskStatus.ANNEXURE_UPLOAD) {
      if (dto.annexureA) updates.annexureA = dto.annexureA
      if (dto.annexureC) updates.annexureC = dto.annexureC
    }
    if (task.status === SalesTaxTaskStatus.CHALLAN_GENERATED) {
      if (dto.psid) updates.psid = dto.psid
      if (dto.challanAmount != null) updates.challanAmount = dto.challanAmount
    }
    if (task.status === SalesTaxTaskStatus.FILED) {
      if (dto.feeInvoiceNo) updates.feeInvoiceNo = dto.feeInvoiceNo
      if (dto.feeInvoiceAmount != null) updates.feeInvoiceAmount = dto.feeInvoiceAmount
      updates.filedAt = new Date()
    }

    return this.transition(task, next, userId, dto.comment, updates, dto.attachment)
  }

  // ── Trainee OR Manager: mark client review done ─────────────────────────────

  async markClientReviewed(taskId: string, userId: string, comment?: string) {
    const task = await this.getOne(taskId)
    if (task.status !== SalesTaxTaskStatus.CLIENT_REVIEW)
      throw new BadRequestException('Task is not in Client Review stage')
    if (task.traineeId !== userId) {
      // allow manager too, role check done in controller
    }
    return this.transition(task, SalesTaxTaskStatus.ANNEXURE_UPLOAD, userId, comment)
  }

  // ── Manager: approve (step 5 or 7) ─────────────────────────────────────────

  async managerApprove(taskId: string, managerId: string, dto: ManagerApproveDto) {
    const task = await this.getOne(taskId)
    if (!MANAGER_STEPS.includes(task.status))
      throw new ForbiddenException('This step does not require manager approval')

    const next = NEXT_STATUS[task.status]!
    return this.transition(task, next, managerId, dto.comment)
  }

  // ── Manager: send back to trainee ───────────────────────────────────────────

  async managerSendBack(taskId: string, managerId: string, dto: ManagerSendBackDto) {
    const task = await this.getOne(taskId)
    if (!MANAGER_STEPS.includes(task.status))
      throw new ForbiddenException('Cannot send back from this stage')

    return this.transition(task, SalesTaxTaskStatus.SENT_BACK, managerId, dto.comment, {
      managerComment: dto.comment,
    })
  }

  // ── Trainee: re-submit after sent back ──────────────────────────────────────

  async reSubmit(taskId: string, userId: string, dto: AdvanceTaskDto) {
    const task = await this.getOne(taskId)
    if (task.status !== SalesTaxTaskStatus.SENT_BACK)
      throw new BadRequestException('Task is not in Sent Back status')
    if (task.traineeId !== userId)
      throw new ForbiddenException('This task is not assigned to you')

    // Determine where it was sent back from by looking at history
    const lastManagerStep = task.history
      .filter(h => MANAGER_STEPS.includes(h.fromStatus as SalesTaxTaskStatus))
      .pop()

    const returnTo = lastManagerStep?.fromStatus as SalesTaxTaskStatus
      ?? SalesTaxTaskStatus.INCHARGE_REVIEW

    return this.transition(task, returnTo, userId, dto.comment, { managerComment: null })
  }

  // ── Trainee: revert last completed step ────────────────────────────────────

  async revertLastStep(taskId: string, userId: string) {
    const task = await this.getOne(taskId)

    if (task.traineeId !== userId)
      throw new ForbiddenException('Only the assigned trainee can revert a step')

    if (task.status === SalesTaxTaskStatus.COMPLETED || task.status === SalesTaxTaskStatus.SENT_BACK)
      throw new BadRequestException('Cannot revert from this status')

    // history is already ordered asc by createdAt (see TASK_INCLUDE)
    const lastEntry = task.history[task.history.length - 1]
    if (!lastEntry || lastEntry.fromStatus === null || lastEntry.fromStatus === undefined)
      throw new BadRequestException('Nothing to revert')

    if (MANAGER_STEPS.includes(lastEntry.fromStatus as SalesTaxTaskStatus))
      throw new BadRequestException('Cannot revert a manager-approved step')

    await this.prisma.salesTaxTaskHistory.delete({ where: { id: lastEntry.id } })

    return this.prisma.salesTaxTask.update({
      where: { id: taskId },
      data: { status: lastEntry.fromStatus as SalesTaxTaskStatus },
      include: TASK_INCLUDE,
    })
  }

  // ── Trainee: skip a fixed step ─────────────────────────────────────────────

  async skipFixedStep(taskId: string, userId: string, stepKey: string, userRole?: string) {
    const task = await this.getOne(taskId)
    const isManager = userRole === 'MANAGER' || userRole === 'TEAM_LEAD'
    if (!isManager && task.traineeId !== userId) throw new ForbiddenException('Only the assigned trainee can skip steps')
    if (!isManager && MANAGER_STEPS.includes(stepKey as SalesTaxTaskStatus))
      throw new ForbiddenException('Manager-approved steps cannot be skipped')
    const allKeys = Object.keys(NEXT_STATUS)
    if (!allKeys.includes(stepKey)) throw new BadRequestException('Invalid step key')
    const curIdx = allKeys.indexOf(task.status as string)
    const skipIdx = allKeys.indexOf(stepKey)
    if (skipIdx <= curIdx) throw new BadRequestException('Cannot skip a step that is already done or in progress')
    if ((task.skippedSteps as string[]).includes(stepKey))
      throw new BadRequestException('Step is already skipped')

    const updated = [...(task.skippedSteps as string[]), stepKey]
    return this.prisma.salesTaxTask.update({
      where: { id: taskId },
      data: { skippedSteps: updated },
      include: TASK_INCLUDE,
    })
  }

  // ── Custom steps: add / delete / complete ──────────────────────────────────

  async addCustomStep(taskId: string, userId: string, dto: { title: string; description?: string; approvedBy: string; insertAfter: string }, userRole?: string) {
    const task = await this.getOne(taskId)
    if (userRole !== 'MANAGER' && userRole !== 'TEAM_LEAD' && task.traineeId !== userId) throw new ForbiddenException('Only the assigned trainee can add steps')
    return this.prisma.salesTaxCustomStep.create({
      data: { taskId, title: dto.title, description: dto.description ?? null, approvedBy: dto.approvedBy as any, insertAfter: dto.insertAfter },
    })
  }

  async deleteCustomStep(taskId: string, stepId: string, userId: string, userRole?: string) {
    const step = await this.prisma.salesTaxCustomStep.findUnique({ where: { id: stepId } })
    if (!step || step.taskId !== taskId) throw new NotFoundException('Step not found')
    if (step.isCompleted) throw new BadRequestException('Cannot delete a completed step')
    const isManager = userRole === 'MANAGER' || userRole === 'TEAM_LEAD'
    if (!isManager) {
      if ((step.approvedBy as any) === 'MANAGER') throw new ForbiddenException('Cannot delete manager-approved steps')
      const task = await this.getOne(taskId)
      if (task.traineeId !== userId) throw new ForbiddenException('Only the assigned trainee can delete steps')
    }
    return this.prisma.salesTaxCustomStep.update({ where: { id: stepId }, data: { isDeleted: true } })
  }

  async completeCustomStep(taskId: string, stepId: string, userId: string, userRole: string) {
    const step = await this.prisma.salesTaxCustomStep.findUnique({ where: { id: stepId } })
    if (!step || step.taskId !== taskId) throw new NotFoundException('Step not found')
    if (step.isCompleted || step.isDeleted) throw new BadRequestException('Step already completed or deleted')
    const task = await this.getOne(taskId)
    if ((step.approvedBy as any) === 'TRAINEE') {
      if (task.traineeId !== userId) throw new ForbiddenException('Only the assigned trainee can complete this step')
    } else {
      if (!['MANAGER', 'TEAM_LEAD', 'ADMIN', 'PARTNER'].includes(userRole)) throw new ForbiddenException('Only a manager can complete this step')
    }
    return this.prisma.salesTaxCustomStep.update({
      where: { id: stepId },
      data: { isCompleted: true, completedAt: new Date(), completedById: userId },
    })
  }

  // ── Manually create a single task (manager / admin) ────────────────────────

  async createSingle(dto: { clientId: string; traineeId: string; periodMonth: number; periodYear: number; dueDate?: string; priority?: string; assignerNote?: string; authority?: string; returnType?: string; taskType?: string }, creatorId: string, creatorRole?: string) {
    const taskType   = dto.taskType   ?? 'SALES_TAX'
    if (taskType === 'SALES_TAX' || taskType === 'WHT') {
      // Sales Tax / WHT are locked to whichever staff member the client is assigned to ,
      // never trust the client-supplied traineeId for these two types.
      const client = await this.prisma.clientProfile.findUnique({ where: { id: dto.clientId }, select: { traineeId: true } })
      if (!client) throw new NotFoundException('Client not found')
      if (!client.traineeId) throw new BadRequestException('This client has no assigned trainee. Assign a trainee to the client before creating this task.')
      if (creatorRole === 'TRAINEE' && client.traineeId !== creatorId) {
        throw new ForbiddenException('This client is not assigned to you')
      }
      dto = { ...dto, traineeId: client.traineeId }
    } else if (creatorRole === 'TRAINEE') {
      dto = { ...dto, traineeId: creatorId }
    }
    const authority  = dto.authority  ?? 'FBR'
    const returnType = dto.returnType ?? 'ORIGINAL'
    const exists = await this.prisma.salesTaxTask.findUnique({
      where: { clientId_periodMonth_periodYear_authority_returnType_taskType: { clientId: dto.clientId, periodMonth: dto.periodMonth, periodYear: dto.periodYear, authority, returnType, taskType } },
      select: { id: true, status: true, trainee: { select: { fullName: true, userCode: true } } },
    })
    if (exists) {
      const typeLabel   = taskType === 'INCOME_TAX' ? (dto.periodMonth > 0 ? 'Quarterly Advance Tax' : 'Income Tax') : taskType === 'SALES_TAX' ? 'Sales Tax' : taskType
      const periodLabel = taskType === 'INCOME_TAX'
        ? (dto.periodMonth > 0 ? `Q${Math.ceil(dto.periodMonth / 3)} ${dto.periodYear}` : `${dto.periodYear}`)
        : `${dto.periodMonth}/${dto.periodYear}`
      if (exists.status === SalesTaxTaskStatus.COMPLETED) {
        throw new ConflictException(`A ${typeLabel} task for this client (${periodLabel}) was already completed. Check "Completed Tasks" or delete it first to create a new one.`)
      }
      const traineeLabel = exists.trainee ? ` (assigned to ${exists.trainee.fullName ?? exists.trainee.userCode})` : ''
      throw new ConflictException(`A ${typeLabel} task for this client (${periodLabel}) is already in progress${traineeLabel}. Check "Incomplete Tasks" to find it.`)
    }

    const task = await this.prisma.salesTaxTask.create({
      data: {
        clientId:    dto.clientId,
        traineeId:   dto.traineeId,
        periodMonth: dto.periodMonth,
        periodYear:  dto.periodYear,
        dueDate:     dto.dueDate ? new Date(dto.dueDate) : null,
        status:      SalesTaxTaskStatus.DATA_COLLECTION,
        priority:    (dto.priority as any) ?? 'MEDIUM',
        assignerNote: dto.assignerNote ?? null,
        taskType,
        authority,
        returnType,
        history: {
          create: {
            fromStatus: null,
            toStatus:   SalesTaxTaskStatus.DATA_COLLECTION,
            actedById:  creatorId,
            comment:    dto.assignerNote ?? null,
          },
        },
      },
      include: TASK_INCLUDE,
    })

    // Attach any global custom steps defined in PipelineStepConfig for this tax type
    await this.pipelineSteps.seedCustomStepsForTask(task.id, taskType)

    // Notify trainee if task was assigned by someone else
    if (task.traineeId && task.traineeId !== creatorId) {
      const creator      = await this.prisma.user.findUnique({ where: { id: creatorId }, select: { fullName: true } })
      const typeLabel    = taskType === 'INCOME_TAX' ? 'Income Tax' : taskType === 'SALES_TAX' ? 'Sales Tax' : 'WHT'
      const periodLabel  = taskType === 'INCOME_TAX' ? `${dto.periodYear}` : `${dto.periodMonth}/${dto.periodYear}`
      const assignerName = creator?.fullName ?? 'Someone'
      const title         = `New Task Assigned by ${assignerName}`
      const body          = `${assignerName} assigned you a ${typeLabel} task (${periodLabel})`
      await this.notifications.create({ userId: task.traineeId, title, body, type: 'SYSTEM', data: { taskId: task.id, taskType, assignedById: creatorId } })
      this.chatGateway.emitToUser(task.traineeId, 'notification', { title, body, taskId: task.id, taskType })
    }

    return task
  }

  async summaryCounts(userId: string, role: string, view?: string) {
    const approvalStatuses = [
      SalesTaxTaskStatus.INCHARGE_REVIEW,
      SalesTaxTaskStatus.SENT_BACK,
    ]

    let taxWhere: Record<string, any>
    // Notices & Appeals count is delegated to FbrService.listCases() below so the badge always
    // matches exactly what the Task Approval queue actually shows (same awaiting-role filtering).
    let noticesCount: Promise<number>

    if (role === 'TRAINEE') {
      // Trainee: only their own assigned tasks
      taxWhere = { traineeId: userId, status: { not: SalesTaxTaskStatus.COMPLETED } }
      noticesCount = this.prisma.fbrCase.count({ where: { assignedToId: userId, currentStage: { not: 'CLOSED' } } })
    } else if (view === 'approval') {
      // Task Approval tab: tasks pending review, the whole team for Team Lead, firm-wide otherwise
      const teamFilter = role === 'TEAM_LEAD' ? { trainee: { teamLeadId: userId } } : {}
      taxWhere = { status: { in: approvalStatuses }, ...teamFilter }
      noticesCount = this.fbrService.listCases(userId, role as StaffRole, undefined, undefined, undefined, 'approval').then(c => c.length)
    } else {
      // Tasks tab ("my tasks"): whatever's assigned directly to this user, regardless of role
      taxWhere = { traineeId: userId, status: { not: SalesTaxTaskStatus.COMPLETED } }
      noticesCount = this.prisma.fbrCase.count({ where: { assignedToId: userId, currentStage: { not: 'CLOSED' } } })
    }

    const [st, it, wht, notices, general] = await Promise.all([
      this.prisma.salesTaxTask.count({ where: { ...taxWhere, taskType: 'SALES_TAX'  } }),
      this.prisma.salesTaxTask.count({ where: { ...taxWhere, taskType: 'INCOME_TAX' } }),
      this.prisma.salesTaxTask.count({ where: { ...taxWhere, taskType: 'WHT'        } }),
      noticesCount,
      // General Tasks have no approval workflow, this count only means anything for the "my tasks" view
      this.prisma.task.count({ where: { assignedToId: userId, status: { not: 'DONE' } } }),
    ])
    return { SALES_TAX: st, INCOME_TAX: it, WHT: wht, NOTICES: notices, GENERAL: general }
  }

  // ── Admin/Partner/Manager: delete any task ────────────────────────────────────
  async adminDeleteTask(taskId: string) {
    const task = await this.prisma.salesTaxTask.findUnique({ where: { id: taskId }, select: { id: true } })
    if (!task) throw new NotFoundException('Task not found')
    await this.prisma.salesTaxTask.delete({ where: { id: taskId } })
    return { success: true }
  }

  // ── Admin: revert a completed task back to DATA_COLLECTION ────────────────────
  async adminRevertToIncomplete(taskId: string, adminId: string) {
    const task = await this.prisma.salesTaxTask.findUnique({ where: { id: taskId }, select: { id: true, status: true } })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status !== SalesTaxTaskStatus.COMPLETED)
      throw new BadRequestException('Only completed tasks can be reverted')
    return this.prisma.salesTaxTask.update({
      where: { id: taskId },
      data: {
        status: SalesTaxTaskStatus.DATA_COLLECTION,
        stepsSnapshot: [],
        history: {
          create: { fromStatus: SalesTaxTaskStatus.COMPLETED, toStatus: SalesTaxTaskStatus.DATA_COLLECTION, actedById: adminId, comment: 'Reverted to incomplete by admin' },
        },
      },
      include: TASK_INCLUDE,
    })
  }

  // ── Auto-create monthly Sales Tax tasks (1 per authority per client) ──────────

  // The API runs as several PM2 cluster workers, so every @Cron fires once per worker.
  // They all race past the "does it exist yet?" check below and collide on the unique index,
  // which is the real guard. Losing that race just means another worker got there first.
  private isDuplicateRow(e: any): boolean {
    return e?.code === 'P2002'
  }

  async createMonthlySalesTaxTasks(month: number, year: number) {
    const clients = await this.prisma.clientProfile.findMany({
      where: {
        salesTaxAuthorities: { isEmpty: false },
        traineeId: { not: null },
      },
      select: { id: true, traineeId: true, salesTaxAuthorities: true },
    })

    const results = { created: 0, skipped: 0 }
    for (const client of clients) {
      for (const authority of client.salesTaxAuthorities) {
        const exists = await this.prisma.salesTaxTask.findUnique({
          where: {
            clientId_periodMonth_periodYear_authority_returnType_taskType: {
              clientId: client.id, periodMonth: month, periodYear: year,
              authority, returnType: 'ORIGINAL', taskType: 'SALES_TAX',
            },
          },
        })
        if (exists) { results.skipped++; continue }

        try {
          await this.prisma.salesTaxTask.create({
            data: {
              clientId:    client.id,
              traineeId:   client.traineeId!,
              periodMonth: month,
              periodYear:  year,
              taskType:    'SALES_TAX',
              authority,
              returnType:  'ORIGINAL',
              status:      SalesTaxTaskStatus.DATA_COLLECTION,
              history: {
                create: {
                  fromStatus: null,
                  toStatus:   SalesTaxTaskStatus.DATA_COLLECTION,
                  actedById:  client.traineeId!,
                  comment:    `Auto-created monthly Sales Tax task (${authority})`,
                },
              },
            },
          })
          results.created++
        } catch (e) {
          if (this.isDuplicateRow(e)) { results.skipped++; continue }
          throw e
        }
      }
    }
    return results
  }

  // ── Auto-create quarterly WHT tasks (1 per client per quarter) ───────────────

  async createQuarterlyWhtTasks(quarter: number, year: number) {
    // quarter 1=Jan-Mar, 2=Apr-Jun, 3=Jul-Sep, 4=Oct-Dec
    // We store periodMonth as the first month of the quarter (1, 4, 7, 10)
    const periodMonth = (quarter - 1) * 3 + 1

    const clients = await this.prisma.clientProfile.findMany({
      where: { hasWhtService: true, traineeId: { not: null } },
      select: { id: true, traineeId: true },
    })

    const results = { created: 0, skipped: 0 }
    for (const client of clients) {
      const exists = await this.prisma.salesTaxTask.findUnique({
        where: {
          clientId_periodMonth_periodYear_authority_returnType_taskType: {
            clientId: client.id, periodMonth, periodYear: year,
            authority: 'FBR', returnType: 'ORIGINAL', taskType: 'WHT',
          },
        },
      })
      if (exists) { results.skipped++; continue }

      try {
        await this.prisma.salesTaxTask.create({
          data: {
            clientId:    client.id,
            traineeId:   client.traineeId!,
            periodMonth,
            periodYear:  year,
            taskType:    'WHT',
            authority:   'FBR',
            returnType:  'ORIGINAL',
            status:      SalesTaxTaskStatus.DATA_COLLECTION,
            history: {
              create: {
                fromStatus: null,
                toStatus:   SalesTaxTaskStatus.DATA_COLLECTION,
                actedById:  client.traineeId!,
                comment:    `Auto-created quarterly WHT task (Q${quarter} ${year})`,
              },
            },
          },
        })
        results.created++
      } catch (e) {
        if (this.isDuplicateRow(e)) { results.skipped++; continue }
        throw e
      }
    }
    return results
  }

  // ── Auto-create quarterly Advance Tax tasks (1 per client per quarter) ────────
  // Same cadence/logic as WHT above, but filed under taskType INCOME_TAX so it
  // shows up in the Income Tax tab/filters/Tax Summary/Files alongside regular
  // Income Tax returns instead of getting its own tab.

  async createQuarterlyAdvanceTaxTasks(quarter: number, year: number) {
    // quarter 1=Jan-Mar, 2=Apr-Jun, 3=Jul-Sep, 4=Oct-Dec
    // We store periodMonth as the first month of the quarter (1, 4, 7, 10) ,
    // the regular annual Income Tax return uses periodMonth 0, so these never collide.
    const periodMonth = (quarter - 1) * 3 + 1

    const clients = await this.prisma.clientProfile.findMany({
      where: { hasAdvanceTaxService: true, traineeId: { not: null } },
      select: { id: true, traineeId: true },
    })

    const results = { created: 0, skipped: 0 }
    for (const client of clients) {
      const exists = await this.prisma.salesTaxTask.findUnique({
        where: {
          clientId_periodMonth_periodYear_authority_returnType_taskType: {
            clientId: client.id, periodMonth, periodYear: year,
            authority: 'FBR', returnType: 'ORIGINAL', taskType: 'INCOME_TAX',
          },
        },
      })
      if (exists) { results.skipped++; continue }

      try {
        await this.prisma.salesTaxTask.create({
          data: {
            clientId:    client.id,
            traineeId:   client.traineeId!,
            periodMonth,
            periodYear:  year,
            taskType:    'INCOME_TAX',
            authority:   'FBR',
            returnType:  'ORIGINAL',
            status:      SalesTaxTaskStatus.DATA_COLLECTION,
            history: {
              create: {
                fromStatus: null,
                toStatus:   SalesTaxTaskStatus.DATA_COLLECTION,
                actedById:  client.traineeId!,
                comment:    `Auto-created quarterly Advance Tax task (Q${quarter} ${year})`,
              },
            },
          },
        })
        results.created++
      } catch (e) {
        if (this.isDuplicateRow(e)) { results.skipped++; continue }
        throw e
      }
    }
    return results
  }

  // ── Internal: perform status transition + log history ───────────────────────

  private async transition(
    task: any,
    toStatus: SalesTaxTaskStatus,
    actedById: string,
    comment?: string,
    extraUpdates: Record<string, any> = {},
    attachment?: string,
  ) {
    // When a task reaches COMPLETED, freeze the current step config as a snapshot
    // so future settings changes never alter how completed tasks are displayed
    let stepsSnapshot: any = undefined
    if (toStatus === SalesTaxTaskStatus.COMPLETED) {
      stepsSnapshot = await this.prisma.pipelineStepConfig.findMany({
        where: { taskType: task.taskType ?? 'SALES_TAX' },
        orderBy: { displayOrder: 'asc' },
      })
    }

    const updated = await this.prisma.salesTaxTask.update({
      where: { id: task.id },
      data: {
        status: toStatus,
        ...(stepsSnapshot !== undefined ? { stepsSnapshot } : {}),
        ...extraUpdates,
        history: {
          create: {
            fromStatus: task.status,
            toStatus,
            actedById,
            comment:    comment    ?? null,
            attachment: attachment ?? null,
          },
        },
      },
      include: TASK_INCLUDE,
    })

    // A completed task becomes a draft invoice for the manager to price and send
    if (toStatus === SalesTaxTaskStatus.COMPLETED) {
      await this.invoices.createDraftForTask(task.id)
    }

    return updated
  }
}
