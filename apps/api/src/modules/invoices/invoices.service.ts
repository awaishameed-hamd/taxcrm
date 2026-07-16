import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { InvoiceKind, InvoiceStatus, Prisma } from '@prisma/client'
import { CreateInvoiceDto, UpdateInvoiceDto, RecordPaymentDto } from './dto/invoice.dto'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Statuses that represent real money owed by the client. DRAFT isn't issued yet,
// RETAINER_INCLUDED is covered by the monthly fee, CANCELLED is void.
const BILLABLE: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID]

const INVOICE_INCLUDE = {
  client: {
    select: {
      id: true, businessName: true, ntn: true, strn: true, address: true,
      hasMonthlyRetainer: true, retainerSalesTax: true, retainerSalesTaxAuthorities: true,
      retainerIncomeTax: true, retainerWht: true,
      user: { select: { fullName: true, email: true, phone: true, userCode: true } },
    },
  },
  task: { select: { id: true, taskType: true, authority: true, periodMonth: true, periodYear: true, returnType: true } },
  payments: {
    orderBy: { paidAt: 'desc' as const },
    include: { recordedBy: { select: { id: true, fullName: true } } },
  },
  createdBy: { select: { id: true, fullName: true } },
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name)

  constructor(private prisma: PrismaService) {}

  private async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const counter = await this.prisma.sequenceCounter.upsert({
      where:  { key: `invoice:${year}` },
      update: { value: { increment: 1 } },
      create: { key: `invoice:${year}`, value: 1 },
    })
    return `INV-${year}-${String(counter.value).padStart(4, '0')}`
  }

  // Would this task's fee already be covered by the client's monthly retainer?
  // Only a hint for the UI — the manager still makes the call.
  private isRetainerCovered(inv: any): boolean {
    const c = inv.client
    if (!c?.hasMonthlyRetainer || !inv.task) return false
    if (inv.task.taskType === 'INCOME_TAX') return c.retainerIncomeTax
    if (inv.task.taskType === 'WHT')        return c.retainerWht
    if (inv.task.taskType === 'SALES_TAX')  return c.retainerSalesTax && c.retainerSalesTaxAuthorities.includes(inv.task.authority ?? 'FBR')
    return false
  }

  private decorate(inv: any) {
    return { ...inv, retainerCovered: this.isRetainerCovered(inv) }
  }

  // ── Listing ────────────────────────────────────────────────────────────────
  async list(status?: string, clientId?: string, search?: string) {
    const where: Prisma.InvoiceWhereInput = {}
    if (status && status !== 'ALL') where.status = status as InvoiceStatus
    if (clientId) where.clientId = clientId
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { client: { businessName: { contains: search, mode: 'insensitive' } } },
        { client: { user: { fullName: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    })
    return invoices.map(i => this.decorate(i))
  }

  async getOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE })
    if (!inv) throw new NotFoundException('Invoice not found')
    return this.decorate(inv)
  }

  // Totals for the page header — outstanding excludes drafts and retainer-covered work.
  async summary() {
    const [agg, drafts, clients] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { status: { in: BILLABLE } },
        _sum: { amount: true, amountPaid: true },
      }),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.DRAFT } }),
      this.prisma.clientProfile.aggregate({ _sum: { openingBalance: true } }),
    ])
    const invoiced = Number(agg._sum.amount ?? 0)
    const paid     = Number(agg._sum.amountPaid ?? 0)
    const opening  = Number(clients._sum.openingBalance ?? 0)
    return {
      draftCount:  drafts,
      totalInvoiced: invoiced,
      totalPaid:     paid,
      outstanding:   opening + invoiced - paid,
    }
  }

  // Opening balance + everything billed and paid since — the client's running account.
  async clientLedger(clientId: string) {
    const client = await this.prisma.clientProfile.findUnique({
      where:  { id: clientId },
      select: { id: true, businessName: true, openingBalance: true, user: { select: { fullName: true } } },
    })
    if (!client) throw new NotFoundException('Client not found')

    const invoices = await this.prisma.invoice.findMany({
      where:   { clientId, status: { in: BILLABLE } },
      include: INVOICE_INCLUDE,
      orderBy: { issueDate: 'asc' },
    })

    const opening  = Number(client.openingBalance)
    const invoiced = invoices.reduce((s, i) => s + Number(i.amount), 0)
    const paid     = invoices.reduce((s, i) => s + Number(i.amountPaid), 0)

    return {
      client,
      openingBalance: opening,
      totalInvoiced:  invoiced,
      totalPaid:      paid,
      outstanding:    opening + invoiced - paid,
      invoices:       invoices.map(i => this.decorate(i)),
    }
  }

  async setOpeningBalance(clientId: string, openingBalance: number) {
    const client = await this.prisma.clientProfile.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) throw new NotFoundException('Client not found')
    return this.prisma.clientProfile.update({
      where:  { id: clientId },
      data:   { openingBalance },
      select: { id: true, openingBalance: true },
    })
  }

  // ── Create / edit ──────────────────────────────────────────────────────────
  async create(dto: CreateInvoiceDto, userId: string) {
    return this.prisma.invoice.create({
      data: {
        invoiceNumber: await this.nextInvoiceNumber(),
        clientId:      dto.clientId,
        kind:          InvoiceKind.MANUAL,
        status:        InvoiceStatus.DRAFT,
        amount:        dto.amount ?? 0,
        description:   dto.description,
        dueDate:       dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes:         dto.notes,
        createdById:   userId,
      },
      include: INVOICE_INCLUDE,
    })
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } })
    if (!inv) throw new NotFoundException('Invoice not found')

    const data: Prisma.InvoiceUpdateInput = {}
    if (dto.amount      !== undefined) data.amount      = dto.amount
    if (dto.description !== undefined) data.description = dto.description
    if (dto.notes       !== undefined) data.notes       = dto.notes
    if (dto.dueDate     !== undefined) data.dueDate     = dto.dueDate ? new Date(dto.dueDate) : null
    if (dto.status      !== undefined) data.status      = dto.status

    // Repricing an invoice that's already part-paid can flip it between
    // PARTIALLY_PAID and PAID, so re-derive the status from the new total.
    if (dto.amount !== undefined && dto.status === undefined && Number(inv.amountPaid) > 0) {
      data.status = this.deriveStatus(dto.amount, Number(inv.amountPaid))
    }

    await this.prisma.invoice.update({ where: { id }, data })
    return this.getOne(id)
  }

  async send(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (Number(inv.amount) <= 0) throw new BadRequestException('Set an amount before sending this invoice')

    await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.SENT, sentAt: new Date() },
    })
    return this.getOne(id)
  }

  async markRetainerIncluded(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { payments: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.payments.length > 0) throw new BadRequestException('This invoice already has payments recorded against it')

    await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.RETAINER_INCLUDED, amount: 0, amountPaid: 0, sentAt: null, paidAt: null },
    })
    return this.getOne(id)
  }

  async cancel(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { payments: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.payments.length > 0) throw new BadRequestException('Cannot cancel an invoice that has payments recorded')

    await this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } })
    return this.getOne(id)
  }

  async remove(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { payments: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.payments.length > 0) throw new BadRequestException('Cannot delete an invoice that has payments recorded — cancel it instead')

    await this.prisma.invoice.delete({ where: { id } })
    return { ok: true }
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  private deriveStatus(amount: number, amountPaid: number): InvoiceStatus {
    if (amountPaid >= amount && amount > 0) return InvoiceStatus.PAID
    if (amountPaid > 0)                     return InvoiceStatus.PARTIALLY_PAID
    return InvoiceStatus.SENT
  }

  async recordPayment(id: string, dto: RecordPaymentDto, userId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.status === InvoiceStatus.RETAINER_INCLUDED || inv.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('This invoice is not billable')
    }
    if (Number(inv.amount) <= 0) throw new BadRequestException('Set an amount on this invoice before recording a payment')

    const newPaid = Number(inv.amountPaid) + dto.amount
    if (newPaid > Number(inv.amount) + 0.001) {
      throw new BadRequestException('Payment exceeds the outstanding amount on this invoice')
    }
    const status = this.deriveStatus(Number(inv.amount), newPaid)

    await this.prisma.invoice.update({
      where: { id },
      data: {
        amountPaid: newPaid,
        status,
        paidAt: status === InvoiceStatus.PAID ? new Date() : null,
        payments: {
          create: {
            amount:       dto.amount,
            method:       dto.method,
            reference:    dto.reference,
            proofUrl:     dto.proofUrl,
            paidAt:       dto.paidAt ? new Date(dto.paidAt) : new Date(),
            notes:        dto.notes,
            recordedById: userId,
          },
        },
      },
    })
    return this.getOne(id)
  }

  async deletePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } })
    if (!payment) throw new NotFoundException('Payment not found')

    const inv     = payment.invoice
    const newPaid = Number(inv.amountPaid) - Number(payment.amount)
    const status  = this.deriveStatus(Number(inv.amount), newPaid)

    await this.prisma.$transaction([
      this.prisma.payment.delete({ where: { id: paymentId } }),
      this.prisma.invoice.update({
        where: { id: inv.id },
        data:  { amountPaid: newPaid < 0 ? 0 : newPaid, status, paidAt: status === InvoiceStatus.PAID ? inv.paidAt : null },
      }),
    ])
    return this.getOne(inv.id)
  }

  // ── Auto-drafting ──────────────────────────────────────────────────────────
  // Called when a task hits COMPLETED. The amount is left at 0 on purpose —
  // the manager prices it before sending.
  async createDraftForTask(taskId: string) {
    const task = await this.prisma.salesTaxTask.findUnique({
      where:  { id: taskId },
      select: { id: true, clientId: true, taskType: true, authority: true, periodMonth: true, periodYear: true, invoice: { select: { id: true } } },
    })
    if (!task || task.invoice) return null // already invoiced, or task vanished

    const label = task.taskType === 'SALES_TAX'
      ? `Sales Tax Return (${task.authority}) — ${MONTHS[(task.periodMonth ?? 1) - 1]} ${task.periodYear}`
      : task.taskType === 'INCOME_TAX'
        ? `Income Tax — ${task.periodYear}`
        : `Withholding Tax — ${MONTHS[(task.periodMonth ?? 1) - 1]} ${task.periodYear}`

    try {
      return await this.prisma.invoice.create({
        data: {
          invoiceNumber: await this.nextInvoiceNumber(),
          clientId:      task.clientId,
          taskId:        task.id,
          kind:          InvoiceKind.TASK,
          status:        InvoiceStatus.DRAFT,
          amount:        0,
          description:   label,
        },
      })
    } catch (e) {
      // Never let an invoicing hiccup roll back the task completion itself
      this.logger.error(`Failed to draft invoice for task ${taskId}: ${e}`)
      return null
    }
  }

  // One draft retainer invoice per retainer client per month. The unique constraint
  // on (clientId, kind, periodMonth, periodYear) makes a re-run a no-op.
  async generateRetainerInvoices(month: number, year: number) {
    const clients = await this.prisma.clientProfile.findMany({
      where:  { hasMonthlyRetainer: true, user: { isActive: true } },
      select: { id: true, retainerAmount: true },
    })

    let created = 0, skipped = 0
    for (const c of clients) {
      const exists = await this.prisma.invoice.findFirst({
        where: { clientId: c.id, kind: InvoiceKind.RETAINER, periodMonth: month, periodYear: year },
        select: { id: true },
      })
      if (exists) { skipped++; continue }

      try {
        await this.prisma.invoice.create({
          data: {
            invoiceNumber: await this.nextInvoiceNumber(),
            clientId:      c.id,
            kind:          InvoiceKind.RETAINER,
            status:        InvoiceStatus.DRAFT,
            amount:        c.retainerAmount,
            periodMonth:   month,
            periodYear:    year,
            description:   `Monthly Retainership — ${MONTHS[month - 1]} ${year}`,
          },
        })
        created++
      } catch (e: any) {
        // The API runs as multiple cluster workers, so this cron fires once per worker and they
        // race past the check above. The unique index on (clientId, kind, period) is the real
        // guard — losing that race just means someone else already drafted it.
        if (e?.code === 'P2002') { skipped++; continue }
        throw e
      }
    }
    return { created, skipped }
  }
}
