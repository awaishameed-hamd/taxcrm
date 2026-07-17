import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { InvoiceKind, InvoiceStatus, OverpaymentType, Prisma } from '@prisma/client'
import { CreateInvoiceDto, UpdateInvoiceDto, ReceivePaymentDto, ApplyPaymentDto, UpdatePaymentDto } from './dto/invoice.dto'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

type Alloc = { invoiceId: string; amount: number; discount?: number; incomeTaxWithheld?: number; salesTaxWithheld?: number }

// Statuses that represent real money owed by the client. DRAFT isn't issued yet,
// RETAINER_INCLUDED is covered by the monthly fee, CANCELLED is void.
const BILLABLE: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID]

// Issued but not yet settled — these are the ones a payment can be applied to,
// and the ones that can tip into OVERDUE.
const AWAITING: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID]

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
  allocations: {
    orderBy: { createdAt: 'asc' as const },
    include: { payment: { include: { recordedBy: { select: { id: true, fullName: true } } } } },
  },
  createdBy: { select: { id: true, fullName: true } },
}

const PAYMENT_INCLUDE = {
  allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, description: true } } } },
  recordedBy:  { select: { id: true, fullName: true } },
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
    await this.sweepOverdue()
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
    await this.sweepOverdue()
    const [agg, drafts, overdue, clients, settledAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { status: { in: BILLABLE } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.DRAFT } }),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
      this.prisma.clientProfile.aggregate({ _sum: { openingBalance: true } }),
      // Settled straight off the invoices, which already roll up cash, discount and
      // withholding — so this can't drift from what the client ledgers show.
      this.prisma.invoice.aggregate({
        where: { status: { in: BILLABLE } },
        _sum: { amountPaid: true, discountTotal: true, incomeTaxWithheld: true, salesTaxWithheld: true },
      }),
    ])
    const invoiced = Number(agg._sum.amount ?? 0)
    const paid     = Number(settledAgg._sum.amountPaid ?? 0)
    const nonCash  = Number(settledAgg._sum.discountTotal ?? 0)
                   + Number(settledAgg._sum.incomeTaxWithheld ?? 0)
                   + Number(settledAgg._sum.salesTaxWithheld ?? 0)
    const opening  = Number(clients._sum.openingBalance ?? 0)

    // Unapplied advances aren't tied to an invoice, so they need adding separately
    const credits  = await this.prisma.payment.findMany({
      where:  { overpaymentType: OverpaymentType.ADVANCE },
      select: { amount: true, allocations: { select: { amount: true } } },
    })
    const unapplied = credits.reduce((s, p) => s + (Number(p.amount) - p.allocations.reduce((t, a) => t + Number(a.amount), 0)), 0)

    return {
      draftCount:    drafts,
      overdueCount:  overdue,
      totalInvoiced: invoiced,
      totalPaid:     paid + unapplied,
      outstanding:   opening + invoiced - paid - nonCash - unapplied,
    }
  }

  // Every client with their running account totals — powers the client sidebar.
  async clientsWithBalances(search?: string) {
    await this.sweepOverdue()
    const clients = await this.prisma.clientProfile.findMany({
      where: search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' } },
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : undefined,
      select: {
        id: true, businessName: true, openingBalance: true,
        user: { select: { fullName: true, isActive: true } },
        invoices: { select: { status: true, amount: true } },
        payments: {
          select: {
            amount: true, overpaymentType: true,
            allocations: { select: { amount: true, discount: true, incomeTaxWithheld: true, salesTaxWithheld: true } },
          },
        },
      },
      orderBy: { businessName: 'asc' },
    })

    return clients.map(c => {
      const billable = c.invoices.filter(i => BILLABLE.includes(i.status))
      const invoiced = billable.reduce((s, i) => s + Number(i.amount), 0)
      const opening  = Number(c.openingBalance)

      // Mirrors the ledger: cash counts (advances in full, bonuses only up to what they
      // were applied to), and so do discounts and tax withheld at source.
      let cash = 0, nonCash = 0, credit = 0
      for (const p of c.payments) {
        const applied = p.allocations.reduce((s, a) => s + Number(a.amount), 0)
        const spare   = Number(p.amount) - applied
        const isBonus = p.overpaymentType === OverpaymentType.BONUS && spare > 0
        cash    += isBonus ? applied : Number(p.amount)
        credit  += isBonus ? 0 : spare
        nonCash += p.allocations.reduce((s, a) => s + Number(a.discount) + Number(a.incomeTaxWithheld) + Number(a.salesTaxWithheld), 0)
      }

      return {
        id:             c.id,
        businessName:   c.businessName,
        fullName:       c.user?.fullName,
        isActive:       c.user?.isActive !== false,
        openingBalance: opening,
        totalInvoiced:  invoiced,
        totalPaid:      cash,
        unappliedCredit: credit,
        outstanding:    opening + invoiced - cash - nonCash,
        draftCount:     c.invoices.filter(i => i.status === InvoiceStatus.DRAFT).length,
        overdueCount:   c.invoices.filter(i => i.status === InvoiceStatus.OVERDUE).length,
      }
    })
  }

  // The client's running account as a dated statement, optionally narrowed to a period.
  //
  // "Opening balance" here means balance brought forward to the start of the period —
  // the client's one-time opening balance plus everything charged and paid before `from`.
  // With no `from` it is just the one-time opening balance. Closing balance is always
  // openingBalance + invoiced − received for the window on screen, so the numbers tie out
  // whatever range is picked.
  async clientLedger(clientId: string, from?: string, to?: string) {
    await this.sweepOverdue()
    const client = await this.prisma.clientProfile.findUnique({
      where:  { id: clientId },
      select: {
        id: true, businessName: true, ntn: true, openingBalance: true, createdAt: true,
        hasMonthlyRetainer: true, retainerAmount: true,
        user: { select: { fullName: true, email: true } },
      },
    })
    if (!client) throw new NotFoundException('Client not found')

    // Drafts live in Invoice Approval until the manager sends them — this section
    // only shows what has actually been issued to the client.
    const invoices = await this.prisma.invoice.findMany({
      where:   { clientId, status: { not: InvoiceStatus.DRAFT } },
      include: INVOICE_INCLUDE,
      orderBy: { issueDate: 'desc' },
    })

    const payments = await this.clientPayments(clientId)

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null
    const toDate   = to   ? new Date(`${to}T23:59:59.999Z`)   : null

    // Every real movement on the account, oldest first.
    type Txn = { date: string; type: 'INVOICE' | 'PAYMENT' | 'DISCOUNT' | 'WITHHOLDING'; ref: string; description: string; charge: number; credit: number }
    const txns: Txn[] = []
    for (const i of invoices.filter(x => BILLABLE.includes(x.status))) {
      txns.push({
        date: i.issueDate.toISOString(), type: 'INVOICE', ref: i.invoiceNumber,
        description: i.description ?? 'Professional services', charge: Number(i.amount), credit: 0,
      })
    }
    for (const p of payments) {
      const against = p.allocations.length > 0
        ? p.allocations.map(a => a.invoice.invoiceNumber).join(', ')
        : 'Advance'

      // Cash. An unapplied advance still credits in full — it reduces what they owe.
      // A bonus doesn't: only the applied part settles the account, the rest is our income.
      const credit = p.bonus > 0 ? p.applied : Number(p.amount)
      txns.push({
        date: p.paidAt.toISOString(), type: 'PAYMENT', ref: against,
        description: `Payment received — ${p.method.replace(/_/g, ' ').toLowerCase()}${p.reference ? ` (${p.reference})` : ''}`
          + (p.unapplied > 0 ? ` · ${p.unapplied} unapplied` : '')
          + (p.bonus     > 0 ? ` · ${p.bonus} kept as bonus` : ''),
        charge: 0, credit,
      })

      // Discount and withholding settle the invoice without cash, so they have to
      // credit the ledger too — otherwise a fully-settled invoice still shows a balance.
      for (const a of p.allocations) {
        if (Number(a.discount) > 0) {
          txns.push({
            date: p.paidAt.toISOString(), type: 'DISCOUNT', ref: a.invoice.invoiceNumber,
            description: 'Discount allowed', charge: 0, credit: Number(a.discount),
          })
        }
        const withheld = Number(a.incomeTaxWithheld) + Number(a.salesTaxWithheld)
        if (withheld > 0) {
          const bits = [
            Number(a.incomeTaxWithheld) > 0 ? `income tax ${a.incomeTaxWithheld}` : null,
            Number(a.salesTaxWithheld)  > 0 ? `sales tax ${a.salesTaxWithheld}`   : null,
          ].filter(Boolean).join(', ')
          txns.push({
            date: p.paidAt.toISOString(), type: 'WITHHOLDING', ref: a.invoice.invoiceNumber,
            description: `Withheld at source — ${bits}`, charge: 0, credit: withheld,
          })
        }
      }
    }
    txns.sort((a, b) => a.date.localeCompare(b.date))

    // Anything before the window rolls into the brought-forward balance
    let openingBalance = Number(client.openingBalance)
    const inPeriod: Txn[] = []
    for (const t of txns) {
      const d = new Date(t.date)
      if (fromDate && d < fromDate) { openingBalance += t.charge - t.credit; continue }
      if (toDate   && d > toDate)   continue
      inPeriod.push(t)
    }

    const totalInvoiced = inPeriod.reduce((s, t) => s + t.charge, 0)
    // Everything that reduced what they owe, cash or not — this is what makes
    // opening + invoiced − settled tie out to the closing balance.
    const totalSettled  = inPeriod.reduce((s, t) => s + t.credit, 0)
    const totalPaid     = inPeriod.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + t.credit, 0)
    const totalDiscount = inPeriod.filter(t => t.type === 'DISCOUNT').reduce((s, t) => s + t.credit, 0)
    const totalWithheld = inPeriod.filter(t => t.type === 'WITHHOLDING').reduce((s, t) => s + t.credit, 0)

    let running = openingBalance
    const timeline = inPeriod.map(t => {
      running += t.charge - t.credit
      return { ...t, balance: running }
    })

    // Credit sitting on the account with no invoice against it yet. A client who has
    // paid ahead ends up with a negative outstanding, which is the signal we want.
    const unappliedCredit = payments.reduce((s, p) => s + p.unapplied, 0)
    const totalBonus      = payments.reduce((s, p) => s + p.bonus, 0)

    return {
      client,
      openingBalance,
      totalInvoiced,
      totalPaid,
      totalDiscount,
      totalWithheld,
      totalBonus,
      unappliedCredit,
      outstanding: openingBalance + totalInvoiced - totalSettled,
      invoices:    invoices.map(i => this.decorate(i)),
      payments,
      timeline,
    }
  }

  // Invoices this client still owes money on — the "Receive Payment" picker.
  async openInvoices(clientId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where:   { clientId, status: { in: AWAITING } },
      orderBy: { issueDate: 'asc' }, // oldest first — that's the order payment auto-applies in
      select:  {
        id: true, invoiceNumber: true, description: true, issueDate: true, dueDate: true, amount: true,
        amountPaid: true, discountTotal: true, incomeTaxWithheld: true, salesTaxWithheld: true,
      },
    })
    // Balance is what's left after everything that settles it, cash or not
    return invoices.map(i => ({
      ...i,
      balance: Number(i.amount) - Number(i.amountPaid) - Number(i.discountTotal)
             - Number(i.incomeTaxWithheld) - Number(i.salesTaxWithheld),
    }))
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
    const subtotal    = dto.subtotal ?? 0
    const salesTax    = dto.salesTax ?? 0
    const outOfPocket = dto.outOfPocket ?? 0
    return this.prisma.invoice.create({
      data: {
        invoiceNumber: await this.nextInvoiceNumber(),
        clientId:      dto.clientId,
        kind:          InvoiceKind.MANUAL,
        status:        InvoiceStatus.DRAFT,
        subtotal, salesTax, outOfPocket,
        amount:        subtotal + salesTax + outOfPocket,
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
    if (dto.description !== undefined) data.description = dto.description
    if (dto.notes       !== undefined) data.notes       = dto.notes
    if (dto.dueDate     !== undefined) data.dueDate     = dto.dueDate ? new Date(dto.dueDate) : null
    if (dto.status      !== undefined) data.status      = dto.status

    // The total is always the three parts added up — never trust a client-sent total
    const priced = dto.subtotal !== undefined || dto.salesTax !== undefined || dto.outOfPocket !== undefined
    const subtotal    = dto.subtotal    ?? Number(inv.subtotal)
    const salesTax    = dto.salesTax    ?? Number(inv.salesTax)
    const outOfPocket = dto.outOfPocket ?? Number(inv.outOfPocket)
    const amount      = subtotal + salesTax + outOfPocket
    if (priced) {
      data.subtotal = subtotal; data.salesTax = salesTax; data.outOfPocket = outOfPocket; data.amount = amount
    }

    // Repricing or moving the due date can flip an issued invoice between
    // SENT / OVERDUE / PARTIALLY_PAID / PAID, so re-derive rather than assume.
    const dueDate = dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : inv.dueDate
    if ((priced || dto.dueDate !== undefined) && dto.status === undefined && AWAITING.includes(inv.status)) {
      data.status = this.deriveStatus(amount, Number(inv.amountPaid), dueDate)
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
      data: {
        status: this.deriveStatus(Number(inv.amount), Number(inv.amountPaid), inv.dueDate),
        sentAt: new Date(),
      },
    })
    return this.getOne(id)
  }

  async markRetainerIncluded(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { allocations: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.allocations.length > 0) throw new BadRequestException('This invoice already has payments applied to it')

    await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.RETAINER_INCLUDED, amount: 0, amountPaid: 0, sentAt: null, paidAt: null },
    })
    return this.getOne(id)
  }

  async cancel(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { allocations: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.allocations.length > 0) throw new BadRequestException('Cannot cancel an invoice that has payments applied to it')

    await this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } })
    return this.getOne(id)
  }

  async remove(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { allocations: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.allocations.length > 0) throw new BadRequestException('Cannot delete an invoice that has payments applied to it — cancel it instead')

    await this.prisma.invoice.delete({ where: { id } })
    return { ok: true }
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  // `settled` is everything that has closed the invoice out — cash plus any discount
  // given and tax the client withheld at source.
  private deriveStatus(amount: number, settled: number, dueDate?: Date | null): InvoiceStatus {
    if (settled >= amount - 0.001 && amount > 0) return InvoiceStatus.PAID
    if (settled > 0)                             return InvoiceStatus.PARTIALLY_PAID
    if (dueDate && dueDate < startOfToday())     return InvoiceStatus.OVERDUE
    return InvoiceStatus.SENT
  }

  // Flip anything issued and unpaid whose due date has passed. Cheap enough to run
  // before a read, which keeps the list honest without waiting on a nightly job.
  private async sweepOverdue() {
    await this.prisma.invoice.updateMany({
      where: { status: InvoiceStatus.SENT, dueDate: { lt: startOfToday() } },
      data:  { status: InvoiceStatus.OVERDUE },
    })
    // A due date pushed back out should pull it off the overdue list again
    await this.prisma.invoice.updateMany({
      where: { status: InvoiceStatus.OVERDUE, OR: [{ dueDate: null }, { dueDate: { gte: startOfToday() } }] },
      data:  { status: InvoiceStatus.SENT },
    })
  }

  // The four settlement figures on an invoice are a rollup of its allocations — always
  // rebuild them from the allocations rather than nudging running totals, so they can't drift.
  private async recomputeInvoices(invoiceIds: string[]) {
    for (const id of [...new Set(invoiceIds)]) {
      const inv = await this.prisma.invoice.findUnique({
        where:  { id },
        select: {
          id: true, amount: true, status: true, paidAt: true, dueDate: true,
          allocations: { select: { amount: true, discount: true, incomeTaxWithheld: true, salesTaxWithheld: true } },
        },
      })
      if (!inv) continue
      // Retainer-covered and cancelled invoices aren't billable, so leave their status alone
      if (inv.status === InvoiceStatus.RETAINER_INCLUDED || inv.status === InvoiceStatus.CANCELLED) continue

      const paid     = inv.allocations.reduce((s, a) => s + Number(a.amount), 0)
      const discount = inv.allocations.reduce((s, a) => s + Number(a.discount), 0)
      const itw      = inv.allocations.reduce((s, a) => s + Number(a.incomeTaxWithheld), 0)
      const stw      = inv.allocations.reduce((s, a) => s + Number(a.salesTaxWithheld), 0)
      const status   = this.deriveStatus(Number(inv.amount), paid + discount + itw + stw, inv.dueDate)

      await this.prisma.invoice.update({
        where: { id },
        data: {
          amountPaid: paid, discountTotal: discount, incomeTaxWithheld: itw, salesTaxWithheld: stw,
          status, paidAt: status === InvoiceStatus.PAID ? (inv.paidAt ?? new Date()) : null,
        },
      })
    }
  }

  // What one allocation closes off an invoice: cash + discount + tax withheld at source
  private settledBy(a: Alloc): number {
    return a.amount + (a.discount ?? 0) + (a.incomeTaxWithheld ?? 0) + (a.salesTaxWithheld ?? 0)
  }

  // Checks a set of allocations against the invoices they target. Throws on the first
  // problem so nothing is written unless the whole lot is valid.
  private async validateAllocations(clientId: string, allocations: Alloc[]) {
    if (allocations.length === 0) return
    const invoices = await this.prisma.invoice.findMany({
      where:  { id: { in: allocations.map(a => a.invoiceId) }, clientId },
      select: {
        id: true, invoiceNumber: true, amount: true, status: true,
        amountPaid: true, discountTotal: true, incomeTaxWithheld: true, salesTaxWithheld: true,
      },
    })
    if (invoices.length !== allocations.length) throw new BadRequestException('One or more invoices do not belong to this client')

    for (const a of allocations) {
      const inv = invoices.find(i => i.id === a.invoiceId)!
      if (!AWAITING.includes(inv.status)) {
        throw new BadRequestException(`${inv.invoiceNumber} is not awaiting payment`)
      }
      const already = Number(inv.amountPaid) + Number(inv.discountTotal) + Number(inv.incomeTaxWithheld) + Number(inv.salesTaxWithheld)
      const balance = Number(inv.amount) - already
      if (this.settledBy(a) > balance + 0.001) {
        throw new BadRequestException(`Payment, discount and withholding together exceed the balance on ${inv.invoiceNumber}`)
      }
    }
  }

  // QuickBooks-style Receive Payment. `amount` is what the client actually paid;
  // allocations say which invoices it settles. Anything left over — including a payment
  // with no allocations at all — stays as unapplied credit against the client.
  async receivePayment(dto: ReceivePaymentDto, userId: string) {
    // A line counts if it settles anything at all — an invoice can be closed purely by
    // a discount or withheld tax, with no cash against it.
    const applied = (dto.allocations ?? []).filter(a => this.settledBy(a) > 0)
    const cash    = applied.reduce((s, a) => s + a.amount, 0)
    if (cash > dto.amount + 0.001) {
      throw new BadRequestException('Cash applied to invoices is more than the payment received')
    }
    await this.validateAllocations(dto.clientId, applied)

    const payment = await this.prisma.payment.create({
      data: {
        clientId:        dto.clientId,
        amount:          dto.amount,
        method:          dto.method,
        reference:       dto.reference,
        proofUrl:        dto.proofUrl,
        paidAt:          dto.paidAt ? new Date(dto.paidAt) : new Date(),
        notes:           dto.notes,
        overpaymentType: dto.overpaymentType ?? OverpaymentType.ADVANCE,
        recordedById:    userId,
        allocations: {
          create: applied.map(a => ({
            invoiceId:         a.invoiceId,
            amount:            a.amount,
            discount:          a.discount ?? 0,
            incomeTaxWithheld: a.incomeTaxWithheld ?? 0,
            salesTaxWithheld:  a.salesTaxWithheld ?? 0,
          })),
        },
      },
    })
    await this.recomputeInvoices(applied.map(a => a.invoiceId))

    return { ok: true, paymentId: payment.id, applied: applied.length, unapplied: dto.amount - cash }
  }

  // Put an advance payment's leftover credit against invoices raised since.
  async applyPayment(paymentId: string, dto: ApplyPaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where:   { id: paymentId },
      include: { allocations: true },
    })
    if (!payment) throw new NotFoundException('Payment not found')

    const alreadyApplied = payment.allocations.reduce((s, a) => s + Number(a.amount), 0)
    const unapplied      = Number(payment.amount) - alreadyApplied

    const toApply = dto.allocations.filter(a => a.amount > 0)
    const total   = toApply.reduce((s, a) => s + a.amount, 0)
    if (toApply.length === 0) throw new BadRequestException('Nothing to apply')
    if (total > unapplied + 0.001) throw new BadRequestException('Applied amount is more than this payment has left')

    await this.validateAllocations(payment.clientId, toApply)

    // An invoice can already have a slice of this payment — top it up rather than
    // adding a second row for the same pair.
    for (const a of toApply) {
      const existing = payment.allocations.find(x => x.invoiceId === a.invoiceId)
      if (existing) {
        await this.prisma.paymentAllocation.update({
          where: { id: existing.id },
          data: {
            amount:            Number(existing.amount) + a.amount,
            discount:          Number(existing.discount) + (a.discount ?? 0),
            incomeTaxWithheld: Number(existing.incomeTaxWithheld) + (a.incomeTaxWithheld ?? 0),
            salesTaxWithheld:  Number(existing.salesTaxWithheld) + (a.salesTaxWithheld ?? 0),
          },
        })
      } else {
        await this.prisma.paymentAllocation.create({
          data: {
            paymentId, invoiceId: a.invoiceId, amount: a.amount,
            discount:          a.discount ?? 0,
            incomeTaxWithheld: a.incomeTaxWithheld ?? 0,
            salesTaxWithheld:  a.salesTaxWithheld ?? 0,
          },
        })
      }
    }
    await this.recomputeInvoices(toApply.map(a => a.invoiceId))

    return { ok: true, applied: toApply.length, remaining: unapplied - total }
  }

  // Every payment from this client, with how much of each is still unapplied.
  async clientPayments(clientId: string) {
    const payments = await this.prisma.payment.findMany({
      where:   { clientId },
      include: PAYMENT_INCLUDE,
      orderBy: { paidAt: 'desc' },
    })
    return payments.map(p => {
      const applied = p.allocations.reduce((s, a) => s + Number(a.amount), 0)
      const spare   = Number(p.amount) - applied
      // Money left over is either credit we owe back in service (advance) or income
      // the client meant us to keep (bonus). Only the former is a client liability.
      const isBonus = p.overpaymentType === OverpaymentType.BONUS && spare > 0
      return {
        ...p,
        applied,
        unapplied: isBonus ? 0 : spare,
        bonus:     isBonus ? spare : 0,
      }
    })
  }

  async updatePayment(paymentId: string, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { allocations: true } })
    if (!payment) throw new NotFoundException('Payment not found')

    if (dto.amount !== undefined) {
      const applied = payment.allocations.reduce((s, a) => s + Number(a.amount), 0)
      if (dto.amount < applied - 0.001) {
        throw new BadRequestException(`This payment already has ${applied} applied to invoices — unapply some first`)
      }
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...(dto.amount    !== undefined ? { amount: dto.amount }              : {}),
        ...(dto.method    !== undefined ? { method: dto.method }              : {}),
        ...(dto.reference !== undefined ? { reference: dto.reference }        : {}),
        ...(dto.proofUrl  !== undefined ? { proofUrl: dto.proofUrl }          : {}),
        ...(dto.paidAt    !== undefined ? { paidAt: new Date(dto.paidAt) }    : {}),
        ...(dto.notes     !== undefined ? { notes: dto.notes }                : {}),
      },
    })
    return { ok: true }
  }

  // Pull a payment's slice back off an invoice — the money returns to unapplied credit.
  async unapplyAllocation(allocationId: string) {
    const alloc = await this.prisma.paymentAllocation.findUnique({ where: { id: allocationId } })
    if (!alloc) throw new NotFoundException('Allocation not found')

    await this.prisma.paymentAllocation.delete({ where: { id: allocationId } })
    await this.recomputeInvoices([alloc.invoiceId])
    return { ok: true }
  }

  async deletePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where:   { id: paymentId },
      include: { allocations: { select: { invoiceId: true } } },
    })
    if (!payment) throw new NotFoundException('Payment not found')

    const touched = payment.allocations.map(a => a.invoiceId)
    await this.prisma.payment.delete({ where: { id: paymentId } }) // allocations cascade
    await this.recomputeInvoices(touched)
    return { ok: true }
  }

  // Which services the client's retainer covers, for the retainer invoice's description
  private retainerServices(c: { retainerSalesTax: boolean; retainerSalesTaxAuthorities: string[]; retainerIncomeTax: boolean; retainerWht: boolean }): string {
    const parts: string[] = []
    if (c.retainerSalesTax && c.retainerSalesTaxAuthorities.length > 0) parts.push(`Sales Tax (${c.retainerSalesTaxAuthorities.join(', ')})`)
    if (c.retainerIncomeTax) parts.push('Income Tax')
    if (c.retainerWht)       parts.push('WHT')
    return parts.join(', ')
  }

  // ── Auto-drafting ──────────────────────────────────────────────────────────
  // Called when a task hits COMPLETED, and the only thing that puts a draft in front
  // of the manager:
  //   - covered by the client's monthly retainer → rolls into that month's single
  //     retainer draft, pre-priced at the agreed fee. Later retainer tasks in the same
  //     month find it already there, so the client gets one bill, not one per service.
  //   - not covered → its own draft at zero for the manager to price.
  async createDraftForTask(taskId: string) {
    const task = await this.prisma.salesTaxTask.findUnique({
      where:  { id: taskId },
      select: {
        id: true, clientId: true, taskType: true, authority: true, periodMonth: true, periodYear: true,
        invoice: { select: { id: true } },
        client: {
          select: {
            hasMonthlyRetainer: true, retainerAmount: true, retainerSalesTax: true,
            retainerSalesTaxAuthorities: true, retainerIncomeTax: true, retainerWht: true,
          },
        },
      },
    })
    if (!task || task.invoice) return null // already invoiced, or task vanished

    try {
      const c = task.client
      const covered = c.hasMonthlyRetainer && (
        task.taskType === 'INCOME_TAX' ? c.retainerIncomeTax :
        task.taskType === 'WHT'        ? c.retainerWht :
        task.taskType === 'SALES_TAX'  ? (c.retainerSalesTax && c.retainerSalesTaxAuthorities.includes(task.authority ?? 'FBR')) :
        false
      )

      if (covered) {
        const now   = new Date()
        const month = now.getMonth() + 1
        const year  = now.getFullYear()
        return await this.ensureRetainerInvoice(task.clientId, month, year, Number(c.retainerAmount), this.retainerServices(c))
      }

      const label = task.taskType === 'SALES_TAX'
        ? `Sales Tax Return (${task.authority}) — ${MONTHS[(task.periodMonth ?? 1) - 1]} ${task.periodYear}`
        : task.taskType === 'INCOME_TAX'
          ? `Income Tax — ${task.periodYear}`
          : `Withholding Tax — ${MONTHS[(task.periodMonth ?? 1) - 1]} ${task.periodYear}`

      return await this.prisma.invoice.create({
        data: {
          invoiceNumber: await this.nextInvoiceNumber(),
          clientId:      task.clientId,
          taskId:        task.id,
          kind:          InvoiceKind.TASK,
          status:        InvoiceStatus.DRAFT,
          subtotal:      0,
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

  // One retainer draft per client per month. Both the monthly cron and a covered task
  // completing land here; the unique index on (clientId, kind, period) settles any race.
  private async ensureRetainerInvoice(clientId: string, month: number, year: number, retainerAmount: number, services: string) {
    const existing = await this.prisma.invoice.findFirst({
      where: { clientId, kind: InvoiceKind.RETAINER, periodMonth: month, periodYear: year },
    })
    if (existing) return existing

    const label = `Monthly Retainership — ${MONTHS[month - 1]} ${year}`
    try {
      return await this.prisma.invoice.create({
        data: {
          invoiceNumber: await this.nextInvoiceNumber(),
          clientId,
          kind:        InvoiceKind.RETAINER,
          status:      InvoiceStatus.DRAFT,
          subtotal:    retainerAmount,
          amount:      retainerAmount,
          periodMonth: month,
          periodYear:  year,
          description: services ? `${label} (${services})` : label,
        },
      })
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return this.prisma.invoice.findFirst({
          where: { clientId, kind: InvoiceKind.RETAINER, periodMonth: month, periodYear: year },
        })
      }
      throw e
    }
  }

  // One draft retainer invoice per retainer client per month. The unique constraint
  // on (clientId, kind, periodMonth, periodYear) makes a re-run a no-op.
  async generateRetainerInvoices(month: number, year: number) {
    const clients = await this.prisma.clientProfile.findMany({
      where:  { hasMonthlyRetainer: true, user: { isActive: true } },
      select: {
        id: true, retainerAmount: true, retainerSalesTax: true,
        retainerSalesTaxAuthorities: true, retainerIncomeTax: true, retainerWht: true,
      },
    })

    let created = 0, skipped = 0
    for (const c of clients) {
      const before = await this.prisma.invoice.findFirst({
        where:  { clientId: c.id, kind: InvoiceKind.RETAINER, periodMonth: month, periodYear: year },
        select: { id: true },
      })
      if (before) { skipped++; continue }

      await this.ensureRetainerInvoice(c.id, month, year, Number(c.retainerAmount), this.retainerServices(c))
      created++
    }
    return { created, skipped }
  }
}
