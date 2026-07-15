import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { assertClientAccess } from '../../common/utils/client-access.util'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function quarterLabel(month: number): string {
  if (month <= 3)  return 'Q1'
  if (month <= 6)  return 'Q2'
  if (month <= 9)  return 'Q3'
  return 'Q4'
}

function periodLabel(taskType: string, month: number, year: number): string {
  if (taskType === 'INCOME_TAX') return `${year}`
  if (taskType === 'WHT')        return `${year} ${quarterLabel(month)}`
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function fileType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(ext))                   return 'pdf'
  if (['xlsx', 'xls', 'csv'].includes(ext))   return 'excel'
  if (['docx', 'doc'].includes(ext))           return 'word'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  return 'other'
}

function fileName(url: string, label?: string): string {
  if (label) return label
  return url.split('/').pop() ?? url
}

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  async getFolders(clientId: string, taxType: string, actorId: string, actorRole: string) {
    await assertClientAccess(this.prisma, clientId, actorId, actorRole as any)
    const tasks = await this.prisma.salesTaxTask.findMany({
      where: { clientId, taskType: taxType },
      select: {
        id: true, periodMonth: true, periodYear: true,
        authority: true, returnType: true, status: true, taskType: true,
        annexureA: true, annexureC: true,
        history: {
          where: { attachment: { not: null } },
          select: { id: true, attachment: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    })

    return tasks.map(task => {
      const files: { id: string; name: string; url: string; fileType: string; source: string }[] = []

      if (task.annexureA) files.push({
        id: `${task.id}-annexA`,
        name: fileName(task.annexureA, 'Annexure A'),
        url: task.annexureA,
        fileType: fileType(task.annexureA),
        source: 'Annexure A',
      })
      if (task.annexureC) files.push({
        id: `${task.id}-annexC`,
        name: fileName(task.annexureC, 'Annexure C'),
        url: task.annexureC,
        fileType: fileType(task.annexureC),
        source: 'Annexure C',
      })

      for (const h of task.history) {
        if (!h.attachment) continue
        files.push({
          id: h.id,
          name: fileName(h.attachment),
          url: h.attachment,
          fileType: fileType(h.attachment),
          source: h.toStatus,
        })
      }

      return {
        taskId:      task.id,
        period:      periodLabel(task.taskType, task.periodMonth, task.periodYear),
        periodMonth: task.periodMonth,
        periodYear:  task.periodYear,
        authority:   task.authority,
        returnType:  task.returnType,
        status:      task.status,
        fileCount:   files.length,
        files,
      }
    })
  }
}
