import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const FIXED_STEP_KEYS = [
  'DATA_COLLECTION','DRAFT_PREPARATION','CLIENT_REVIEW','ANNEXURE_UPLOAD',
  'INCHARGE_REVIEW','CHALLAN_GENERATED','FILED',
]

const DEFAULT_STEPS = [
  { stepKey: 'DATA_COLLECTION',     label: 'Collection of Data from Client',                     description: 'Collect all required data and documents from the client before proceeding.',                     approvedBy: 'TRAINEE',  displayOrder: 0 },
  { stepKey: 'DRAFT_PREPARATION',   label: 'Prepare Draft Return',                               description: 'Prepare the draft tax return based on collected data.',                                         approvedBy: 'TRAINEE',  displayOrder: 1 },
  { stepKey: 'CLIENT_REVIEW',       label: 'Share Draft Return with Client for Approval',        description: 'Share the prepared draft with the client and get their confirmation.',                          approvedBy: 'TRAINEE',  displayOrder: 2 },
  { stepKey: 'ANNEXURE_UPLOAD',     label: 'Upload Draft Return on Portal',                      description: 'Upload the approved draft return on the tax portal.',                                           approvedBy: 'TRAINEE',  displayOrder: 3 },
  { stepKey: 'INCHARGE_REVIEW',     label: 'Get it Reviewed by Job-Incharge',                   description: 'Submit for manager review before generating challan.',                                           approvedBy: 'MANAGER',  displayOrder: 4 },
  { stepKey: 'CHALLAN_GENERATED',   label: 'Generate Challan / PSID and Send to Client',        description: 'Generate the payment challan or PSID and share with the client.',                               approvedBy: 'TRAINEE',  displayOrder: 5 },
  { stepKey: 'FILED',               label: 'Submit Task and Issue Invoice',                      description: 'File the return on the portal and issue the fee invoice to the client.',                        approvedBy: 'TRAINEE',  displayOrder: 6 },
]

const TASK_TYPES = ['SALES_TAX', 'INCOME_TAX', 'WHT']

@Injectable()
export class PipelineStepsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Seed default step configs if not present
    for (const taskType of TASK_TYPES) {
      for (const step of DEFAULT_STEPS) {
        await this.prisma.pipelineStepConfig.upsert({
          where: { taskType_stepKey: { taskType, stepKey: step.stepKey } },
          create: { taskType, ...step },
          update: {},  // never overwrite admin customizations
        })
      }
    }
  }

  async listByTaskType(taskType: string) {
    return this.prisma.pipelineStepConfig.findMany({
      where: { taskType: taskType.toUpperCase() },
      orderBy: { displayOrder: 'asc' },
    })
  }

  async createStep(dto: { taskType: string; label: string; description?: string; approvedBy?: string }) {
    const taskType = dto.taskType.toUpperCase()

    // Get all steps to determine insert position and insertAfter
    const allSteps = await this.prisma.pipelineStepConfig.findMany({
      where: { taskType },
      orderBy: { displayOrder: 'asc' },
    })
    const nextOrder = (allSteps[allSteps.length - 1]?.displayOrder ?? -1) + 1

    // Find the last fixed (non-custom) step, the new step will appear after it
    const lastFixed = [...allSteps].reverse().find(s => FIXED_STEP_KEYS.includes(s.stepKey))
    const insertAfter = lastFixed?.stepKey ?? 'FILED'

    const stepKey = `CUSTOM_${Date.now()}`
    const config = await this.prisma.pipelineStepConfig.create({
      data: {
        taskType,
        stepKey,
        label:        dto.label,
        description:  dto.description ?? null,
        approvedBy:   dto.approvedBy ?? 'TRAINEE',
        displayOrder: nextOrder,
        isActive:     true,
      },
    })

    // Auto-create this step for all incomplete tasks of this type
    const incompleteTasks = await this.prisma.salesTaxTask.findMany({
      where: { taskType, status: { not: 'COMPLETED' } },
      select: { id: true },
    })
    if (incompleteTasks.length > 0) {
      await this.prisma.salesTaxCustomStep.createMany({
        data: incompleteTasks.map(t => ({
          taskId:              t.id,
          title:               dto.label,
          description:         dto.description ?? null,
          approvedBy:          (dto.approvedBy ?? 'TRAINEE') as any,
          insertAfter,
          pipelineStepConfigId: config.id,
        })),
        skipDuplicates: true,
      })
    }

    return config
  }

  // Called by SalesTaxTasksService when creating a new task ,
  // attaches any existing global custom steps to the task
  async seedCustomStepsForTask(taskId: string, taskType: string) {
    const customConfigs = await this.prisma.pipelineStepConfig.findMany({
      where: { taskType: taskType.toUpperCase(), isActive: true, stepKey: { startsWith: 'CUSTOM_' } },
      orderBy: { displayOrder: 'asc' },
    })
    if (customConfigs.length === 0) return

    // Find insertAfter for each (nearest preceding fixed step)
    const allSteps = await this.prisma.pipelineStepConfig.findMany({
      where: { taskType: taskType.toUpperCase() },
      orderBy: { displayOrder: 'asc' },
    })
    await this.prisma.salesTaxCustomStep.createMany({
      data: customConfigs.map(cfg => {
        const cfgIdx = allSteps.findIndex(s => s.id === cfg.id)
        const insertAfter = [...allSteps.slice(0, cfgIdx)].reverse()
          .find(s => FIXED_STEP_KEYS.includes(s.stepKey))?.stepKey ?? 'FILED'
        return {
          taskId,
          title:               cfg.label,
          description:         cfg.description ?? null,
          approvedBy:          cfg.approvedBy as any,
          insertAfter,
          pipelineStepConfigId: cfg.id,
        }
      }),
      skipDuplicates: true,
    })
  }

  async updateStep(id: string, dto: { label?: string; description?: string; approvedBy?: string; isActive?: boolean }) {
    return this.prisma.pipelineStepConfig.update({
      where: { id },
      data: dto,
    })
  }

  async reorder(ids: string[]) {
    // ids ordered from top to bottom, assign displayOrder by index
    await Promise.all(
      ids.map((id, i) => this.prisma.pipelineStepConfig.update({ where: { id }, data: { displayOrder: i } }))
    )
    return { ok: true }
  }
}
