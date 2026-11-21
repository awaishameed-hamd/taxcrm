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
  // Income Tax: month 0 = the regular annual return, 1/4/7/10 = a Quarterly Advance Tax task
  if (taskType === 'INCOME_TAX') return month > 0 ? `${year} ${quarterLabel(month)} Advance Tax` : `${year}`
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

  // One folder per audit engagement, holding what was attached to the
  // engagement itself plus everything attached to its working papers. The
  // working paper's area names the file, which is how an auditor looks for it.
  private async getAuditFolders(clientId: string) {
    const engagements = await this.prisma.auditEngagement.findMany({
      where:   { clientId },
      orderBy: { periodEndDate: 'desc' },
      select: {
        id: true, title: true, taskType: true, status: true, periodLabel: true, periodEndDate: true,
        attachments: { select: { id: true, fileName: true, fileKey: true, kind: true, createdAt: true } },
        workingPapers: {
          select: {
            areaName: true,
            attachments: { select: { id: true, fileName: true, fileKey: true, createdAt: true } },
          },
        },
      },
    })

    return engagements.map(e => {
      const files = [
        ...e.attachments.map(a => ({
          id: a.id, name: a.fileName, url: a.fileKey, fileType: fileType(a.fileKey),
          // The two sign-off documents are worth calling out by name
          source: a.kind === 'FINANCIAL_STATEMENTS' ? 'Financial Statements'
                : a.kind === 'AUDIT_REPORT'         ? 'Audit Report'
                : 'Engagement',
        })),
        ...e.workingPapers.flatMap(w => w.attachments.map(a => ({
          id: a.id, name: a.fileName, url: a.fileKey, fileType: fileType(a.fileKey),
          source: w.areaName,
        }))),
      ]

      return {
        taskId:    e.id,
        period:    e.periodLabel ?? String(e.periodEndDate.getFullYear()),
        authority: e.taskType,
        status:    e.status,
        title:     e.title,
        fileCount: files.length,
        files,
      }
    })
  }

  async getFolders(clientId: string, taxType: string, actorId: string, actorRole: string) {
    await assertClientAccess(this.prisma, clientId, actorId, actorRole as any)

    // Audit files hang off engagements, not tax tasks, so they come from a
    // different source entirely rather than being another tab over the same one.
    if (taxType === 'AUDIT') return this.getAuditFolders(clientId)
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
