import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { InvoiceKind, InvoiceStatus, OverpaymentType, Prisma } from '@prisma/client'
import { CreateInvoiceDto, UpdateInvoiceDto, ReceivePaymentDto, ApplyPaymentDto, UpdatePaymentDto } from './dto/invoice.dto'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

// ClientProfile.yearEnd is stored as a month name, turn it into 1-12.
// Anything unrecognised falls back to December, matching the column default.
const yearEndMonthOf = (yearEnd?: string | null): number => {
  const name = (yearEnd ?? '').trim().toUpperCase()
  const i = MONTHS.findIndex(m => m.toUpperCase() === name)
  return i >= 0 ? i + 1 : 12
}

// Which fiscal year a period belongs to, named by the calendar year the client's
// year end falls in. With a June year end, Aug 2026 work belongs to FY 2027
// (Jul 2026 to Jun 2027) while Jan 2027 work belongs to that same FY 2027.
const fiscalYearOf = (month: number, year: number, yearEndMonth: number): number =>
  month <= yearEndMonth ? year : year + 1

type Alloc = { invoiceId: string; amount: number; discount?: number; incomeTaxWithheld?: number; salesTaxWithheld?: number }

// Statuses that represent real money owed by the client. DRAFT isn't issued yet,
// RETAINER_INCLUDED is covered by the monthly fee, CANCELLED is void.
const BILLABLE: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID]

// Issued but not yet settled, these are the ones a payment can be applied to,
// and the ones that can tip into OVERDUE.
const AWAITING: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID]

const INVOICE_INCLUDE = {
  client: {
    select: {
      id: true, businessName: true, ntn: true, strn: true, address: true,
      hasMonthlyRetainer: true, retainerSalesTax: true, retainerSalesTaxAuthorities: true,
      retainerIncomeTax: true, retainerWht: true,
      hasAnnualBilling: true, annualSalesTax: true, annualSalesTaxAuthorities: true,
      annualIncomeTax: true, annualWht: true,
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
  // Only a hint for the UI, the manager still makes the call.
  private isRetainerCovered(inv: any): boolean {
    const c = inv.client
    if (!c?.hasMonthlyRetainer || !inv.task) return false
    if (inv.task.taskType === 'INCOME_TAX') return c.retainerIncomeTax
    if (inv.task.taskType === 'WHT')        return c.retainerWht
    if (inv.task.taskType === 'SALES_TAX')  return c.retainerSalesTax && c.retainerSalesTaxAuthorities.includes(inv.task.authority ?? 'FBR')
    return false
  }

  // Same hint for the yearly billing contract.
  private isAnnualCovered(inv: any): boolean {
    const c = inv.client
    if (!c?.hasAnnualBilling || !inv.task) return false
    if (inv.task.taskType === 'INCOME_TAX') return c.annualIncomeTax
    if (inv.task.taskType === 'WHT')        return c.annualWht
    if (inv.task.taskType === 'SALES_TAX')  return c.annualSalesTax && c.annualSalesTaxAuthorities.includes(inv.task.authority ?? 'FBR')
    return false
  }

  private decorate(inv: any) {
    return { ...inv, retainerCovered: this.isRetainerCovered(inv), annualCovered: this.isAnnualCovered(inv) }
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

  // ── Invoice register ───────────────────────────────────────────────────────
  // Every invoice that actually went out to a client, across all of them, with
  // the balance and ageing worked out here so the page is only a renderer.
  // Drafts are excluded on purpose, they belong to Invoice Approval; so is work
  // absorbed by a retainer or annual contract, which was never billed.
  //
  // Each row carries the bucket it falls in, which is how it stands today rather
  // than its stored status:
  //   notdue  its due date has not passed, or it has none
  //   overdue past its due date with a balance left
  //   partial something has been settled but not all of it
  //   paid    settled in full, by cash, discount or tax withheld at source
  // The caller groups and totals by that, so the pills can switch without a refetch.
  async register(from?: string, to?: string, clientId?: string, search?: string) {
    await this.sweepOverdue()

    const where: Prisma.InvoiceWhereInput = { status: { in: BILLABLE } }
    if (clientId) where.clientId = clientId
    if (from || to) {
      where.issueDate = {
        ...(from ? { gte: new Date(from) } : {}),
        // `to` names a day, so take everything up to the end of it
        ...(to   ? { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) } : {}),
      }
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { description:   { contains: search, mode: 'insensitive' } },
        { client: { businessName: { contains: search, mode: 'insensitive' } } },
        { client: { user: { fullName: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true, invoiceNumber: true, kind: true, status: true, description: true,
        issueDate: true, dueDate: true, sentAt: true, paidAt: true,
        amount: true, subtotal: true, salesTax: true, outOfPocket: true,
        amountPaid: true, discountTotal: true, incomeTaxWithheld: true, salesTaxWithheld: true,
        client: { select: { id: true, businessName: true, user: { select: { fullName: true } } } },
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    })

    const today = startOfToday()
    return invoices.map(i => {
      // Balance is the amount less everything that settled it, never amount less
      // cash: clients routinely take a discount and withhold tax at source.
      const settled = Number(i.amountPaid) + Number(i.discountTotal)
                    + Number(i.incomeTaxWithheld) + Number(i.salesTaxWithheld)
      const balance = Number(i.amount) - settled
      const overdue = balance > 0.001 && !!i.dueDate && i.dueDate < today
      const daysOverdue = overdue && i.dueDate
        ? Math.floor((today.getTime() - new Date(i.dueDate).setHours(0, 0, 0, 0)) / 86400000)
        : 0

      return {
        ...i,
        clientName: i.client?.businessName || i.client?.user?.fullName || '',
        settled, balance, daysOverdue,
        bucket: balance <= 0.001 ? 'paid' : overdue ? 'overdue' : settled > 0.001 ? 'partial' : 'notdue',
      }
    })
  }

  // Totals for the page header, outstanding excludes drafts and retainer-covered work.
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
      // withholding, so this can't drift from what the client ledgers show.
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

  // Every client with their running account totals, powers the client sidebar.
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
  // "Opening balance" here means balance brought forward to the start of the period ,
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
        hasAnnualBilling: true, annualBillingAmount: true,
        user: { select: { fullName: true, email: true } },
      },
    })
    if (!client) throw new NotFoundException('Client not found')

    // Drafts live in Invoice Approval until the manager sends them, this section
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
    type Txn = { date: string; type: 'INVOICE' | 'PAYMENT' | 'DISCOUNT' | 'WITHHOLDING'; ref: string; description: string; charge: number; credit: number; paymentId?: string; unapplied?: number }
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

      // Cash. An unapplied advance still credits in full, it reduces what they owe.
      // A bonus doesn't: only the applied part settles the account, the rest is our income.
      const credit = p.bonus > 0 ? p.applied : Number(p.amount)
      txns.push({
        date: p.paidAt.toISOString(), type: 'PAYMENT', ref: against,
        description: `Payment received, ${p.method.replace(/_/g, ' ').toLowerCase()}${p.reference ? ` (${p.reference})` : ''}`
          + (p.unapplied > 0 ? ` · ${p.unapplied} unapplied` : '')
          + (p.bonus     > 0 ? ` · ${p.bonus} kept as bonus` : ''),
        charge: 0, credit,
        // Carried so the ledger can offer an Apply action on an unapplied advance.
        paymentId: p.id, unapplied: p.unapplied,
      })

      // Discount and withholding settle the invoice without cash, so they have to
      // credit the ledger too, otherwise a fully-settled invoice still shows a balance.
      for (const a of p.allocations) {
        if (Number(a.discount) > 0) {
          txns.push({
            date: p.paidAt.toISOString(), type: 'DISCOUNT', ref: a.invoice.invoiceNumber,
            description: 'Discount allowed', charge: 0, credit: Number(a.discount),
          })
        }
        const withheld = Number(a.incomeTaxWithheld) + Number(a.salesTaxWithheld)
        if (withheld > 0) {
          // The amount is already in the Payment column, so keep the description
          // to the kind of withholding only.
          const bits = [
            Number(a.incomeTaxWithheld) > 0 ? 'income tax' : null,
            Number(a.salesTaxWithheld)  > 0 ? 'sales tax'  : null,
          ].filter(Boolean).join(', ')
          txns.push({
            date: p.paidAt.toISOString(), type: 'WITHHOLDING', ref: a.invoice.invoiceNumber,
            description: `Withheld at source, ${bits}`, charge: 0, credit: withheld,
          })
        }
      }
    }
    txns.sort((a, b) => a.date.localeCompare(b.date))

    // The opening balance is now carried as an OPENING invoice in the timeline,
    // so the brought-forward starts at zero and only rolls up pre-window movements
    // (which include that invoice when it predates the window).
    let openingBalance = 0
    const inPeriod: Txn[] = []
    for (const t of txns) {
      const d = new Date(t.date)
      if (fromDate && d < fromDate) { openingBalance += t.charge - t.credit; continue }
      if (toDate   && d > toDate)   continue
      inPeriod.push(t)
    }

    const totalInvoiced = inPeriod.reduce((s, t) => s + t.charge, 0)
    // Everything that reduced what they owe, cash or not, this is what makes
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

  // Invoices this client still owes money on, the "Receive Payment" picker.
  async openInvoices(clientId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where:   { clientId, status: { in: AWAITING } },
      orderBy: { issueDate: 'asc' }, // oldest first, that's the order payment auto-applies in
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

  // Stores the opening balance on the client and mirrors it into a single
  // OPENING-kind invoice, so it appears in the ledger and settles through Receive
  // Payment. The ledger reads the invoice, not the field, so nothing double counts.
  async setOpeningBalance(clientId: string, openingBalance: number, date?: string) {
    const client = await this.prisma.clientProfile.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) throw new NotFoundException('Client not found')

    const amount    = Math.max(0, Number(openingBalance) || 0)
    const issueDate = date ? new Date(date) : new Date()
    const existing  = await this.prisma.invoice.findFirst({ where: { clientId, kind: InvoiceKind.OPENING } })

    if (amount > 0) {
      if (existing) {
        await this.prisma.invoice.update({
          where: { id: existing.id },
          data: {
            subtotal: amount, salesTax: 0, outOfPocket: 0, amount, issueDate,
            status: this.deriveStatus(amount, Number(existing.amountPaid), null),
          },
        })
      } else {
        await this.prisma.invoice.create({
          data: {
            invoiceNumber: await this.nextInvoiceNumber(),
            clientId, kind: InvoiceKind.OPENING, status: InvoiceStatus.SENT,
            subtotal: amount, amount, description: 'Opening Balance',
            issueDate, sentAt: new Date(),
          },
        })
      }
    } else if (existing) {
      // Clearing it: drop the invoice only if nothing was paid against it.
      const allocs = await this.prisma.paymentAllocation.count({ where: { invoiceId: existing.id } })
      if (allocs === 0) await this.prisma.invoice.delete({ where: { id: existing.id } })
    }

    return this.prisma.clientProfile.update({
      where:  { id: clientId },
      data:   { openingBalance: amount, openingBalanceDate: date ? new Date(date) : null },
      select: { id: true, openingBalance: true, openingBalanceDate: true },
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

    // The total is always the three parts added up, never trust a client-sent total
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
    return this.markCoveredByContract(id, InvoiceStatus.RETAINER_INCLUDED)
  }

  async markAnnualIncluded(id: string) {
    return this.markCoveredByContract(id, InvoiceStatus.ANNUAL_INCLUDED)
  }

  // Work absorbed by a standing contract, monthly or yearly. The draft stays on
  // record at zero so the manager can see the work happened, it just never bills.
  private async markCoveredByContract(id: string, status: InvoiceStatus) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { allocations: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found')
    if (inv.allocations.length > 0) throw new BadRequestException('This invoice already has payments applied to it')

    await this.prisma.invoice.update({
      where: { id },
      data:  { status, amount: 0, amountPaid: 0, sentAt: null, paidAt: null },
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
    if (inv.allocations.length > 0) throw new BadRequestException('Cannot delete an invoice that has payments applied to it, cancel it instead')

    await this.prisma.invoice.delete({ where: { id } })
    return { ok: true }
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  // `settled` is everything that has closed the invoice out, cash plus any discount
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

  // The four settlement figures on an invoice are a rollup of its allocations, always
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
      // Contract-covered and cancelled invoices aren't billable, so leave their status alone
      if (inv.status === InvoiceStatus.RETAINER_INCLUDED
        || inv.status === InvoiceStatus.ANNUAL_INCLUDED
        || inv.status === InvoiceStatus.CANCELLED) continue

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
  // allocations say which invoices it settles. Anything left over, including a payment
  // with no allocations at all, stays as unapplied credit against the client.
  async receivePayment(dto: ReceivePaymentDto, userId: string) {
    // A line counts if it settles anything at all, an invoice can be closed purely by
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

    // A row counts if it settles anything at all, cash from the credit or a
    // discount / tax withheld that closes the invoice without touching the credit.
    const toApply = dto.allocations.filter(a => (a.amount + (a.discount ?? 0) + (a.incomeTaxWithheld ?? 0) + (a.salesTaxWithheld ?? 0)) > 0)
    const total   = toApply.reduce((s, a) => s + a.amount, 0)
    if (toApply.length === 0) throw new BadRequestException('Nothing to apply')
    if (total > unapplied + 0.001) throw new BadRequestException('Applied amount is more than this payment has left')

    await this.validateAllocations(payment.clientId, toApply)

    // An invoice can already have a slice of this payment, top it up rather than
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
        throw new BadRequestException(`This payment already has ${applied} applied to invoices, unapply some first`)
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

  // Pull a payment's slice back off an invoice, the money returns to unapplied credit.
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

  // Which services a contract covers, for the invoice's description
  private contractServices(salesTax: boolean, authorities: string[], incomeTax: boolean, wht: boolean): string {
    const parts: string[] = []
    if (salesTax && authorities.length > 0) parts.push(`Sales Tax (${authorities.join(', ')})`)
    if (incomeTax) parts.push('Income Tax')
    if (wht)       parts.push('WHT')
    return parts.join(', ')
  }

  private retainerServices(c: { retainerSalesTax: boolean; retainerSalesTaxAuthorities: string[]; retainerIncomeTax: boolean; retainerWht: boolean }): string {
    return this.contractServices(c.retainerSalesTax, c.retainerSalesTaxAuthorities, c.retainerIncomeTax, c.retainerWht)
  }

  private annualServices(c: { annualSalesTax: boolean; annualSalesTaxAuthorities: string[]; annualIncomeTax: boolean; annualWht: boolean }): string {
    return this.contractServices(c.annualSalesTax, c.annualSalesTaxAuthorities, c.annualIncomeTax, c.annualWht)
  }

  // Does this contract's service selection cover the task in hand?
  private covers(taskType: string, authority: string | null, salesTax: boolean, authorities: string[], incomeTax: boolean, wht: boolean): boolean {
    if (taskType === 'INCOME_TAX') return incomeTax
    if (taskType === 'WHT')        return wht
    if (taskType === 'SALES_TAX')  return salesTax && authorities.includes(authority ?? 'FBR')
    return false
  }

  // ── Auto-drafting ──────────────────────────────────────────────────────────
  // Called when a task hits COMPLETED, and the only thing that puts a draft in front
  // of the manager:
  //   - covered by the client's monthly retainer → rolls into that month's single
  //     retainer draft, pre-priced at the agreed fee. Later retainer tasks in the same
  //     month find it already there, so the client gets one bill, not one per service.
  //   - covered by the client's yearly billing → the same, rolled into that fiscal
  //     year's single annual draft instead.
  //   - not covered → its own draft at zero for the manager to price.
  async createDraftForTask(taskId: string) {
    const task = await this.prisma.salesTaxTask.findUnique({
      where:  { id: taskId },
      select: {
        id: true, clientId: true, taskType: true, authority: true, periodMonth: true, periodYear: true,
        invoice: { select: { id: true } },
        client: {
          select: {
            yearEnd: true,
            hasMonthlyRetainer: true, retainerAmount: true, retainerSalesTax: true,
            retainerSalesTaxAuthorities: true, retainerIncomeTax: true, retainerWht: true,
            hasAnnualBilling: true, annualBillingAmount: true, annualSalesTax: true,
            annualSalesTaxAuthorities: true, annualIncomeTax: true, annualWht: true,
          },
        },
      },
    })
    if (!task || task.invoice) return null // already invoiced, or task vanished

    try {
      const c = task.client
      const covered = c.hasMonthlyRetainer && this.covers(
        task.taskType, task.authority,
        c.retainerSalesTax, c.retainerSalesTaxAuthorities, c.retainerIncomeTax, c.retainerWht,
      )

      // The month the work belongs to, so a July return rolls into July's bill
      // even when it is completed in August. An annual return carries no month,
      // so it falls back to the month just ended, which is what the cron bills.
      const now       = new Date()
      const prev      = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const taskMonth = task.periodMonth ?? 0
      const hasPeriod = taskMonth >= 1 && taskMonth <= 12
      const month = hasPeriod ? taskMonth : prev.getMonth() + 1
      const year  = hasPeriod ? (task.periodYear ?? prev.getFullYear()) : prev.getFullYear()

      if (covered) {
        return await this.ensureRetainerInvoice(task.clientId, month, year, Number(c.retainerAmount), this.retainerServices(c))
      }

      // A monthly retainer wins where both contracts name the same service, so
      // this is only reached for work the retainer does not cover.
      const annualCovered = c.hasAnnualBilling && this.covers(
        task.taskType, task.authority,
        c.annualSalesTax, c.annualSalesTaxAuthorities, c.annualIncomeTax, c.annualWht,
      )

      if (annualCovered) {
        const yem = yearEndMonthOf(c.yearEnd)
        // An income tax return names its own tax year, everything else is placed
        // by the month it covers.
        const fy = hasPeriod ? fiscalYearOf(month, year, yem) : year
        return await this.ensureAnnualInvoice(task.clientId, fy, yem, Number(c.annualBillingAmount), this.annualServices(c))
      }

      const label = task.taskType === 'SALES_TAX'
        ? `Sales Tax Return (${task.authority}), ${MONTHS[(task.periodMonth ?? 1) - 1]} ${task.periodYear}`
        : task.taskType === 'INCOME_TAX'
          ? `Income Tax, ${task.periodYear}`
          : `Withholding Tax, ${MONTHS[(task.periodMonth ?? 1) - 1]} ${task.periodYear}`

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

    const label = `Monthly Retainership, ${MONTHS[month - 1]} ${year}`
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

  // One annual draft per client per fiscal year. Month 0 stands for the whole
  // year, so the unique index on (clientId, kind, periodMonth, periodYear) still
  // catches a duplicate; a null there would not, Postgres treats nulls as distinct.
  private async ensureAnnualInvoice(clientId: string, year: number, yearEndMonth: number, amount: number, services: string) {
    const existing = await this.prisma.invoice.findFirst({
      where: { clientId, kind: InvoiceKind.ANNUAL, periodMonth: 0, periodYear: year },
    })
    if (existing) return existing

    const label = `Annual Billing, Year Ended ${MONTHS[yearEndMonth - 1]} ${year}`
    try {
      return await this.prisma.invoice.create({
        data: {
          invoiceNumber: await this.nextInvoiceNumber(),
          clientId,
          kind:        InvoiceKind.ANNUAL,
          status:      InvoiceStatus.DRAFT,
          subtotal:    amount,
          amount,
          periodMonth: 0,
          periodYear:  year,
          description: services ? `${label} (${services})` : label,
        },
      })
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return this.prisma.invoice.findFirst({
          where: { clientId, kind: InvoiceKind.ANNUAL, periodMonth: 0, periodYear: year },
        })
      }
      throw e
    }
  }

  // Raised on the 1st of the month after a client's fiscal year end, so the run on
  // 1 July bills every June-year-end client for the year that just closed. Only
  // clients whose year end matches yearEndMonth are touched, which is what keeps
  // one monthly run from billing the whole book.
  async generateAnnualInvoices(yearEndMonth: number, year: number) {
    const clients = await this.prisma.clientProfile.findMany({
      where:  { hasAnnualBilling: true, user: { isActive: true } },
      select: {
        id: true, yearEnd: true, annualBillingAmount: true, annualSalesTax: true,
        annualSalesTaxAuthorities: true, annualIncomeTax: true, annualWht: true,
      },
    })

    let created = 0, skipped = 0
    for (const c of clients) {
      if (yearEndMonthOf(c.yearEnd) !== yearEndMonth) continue

      const before = await this.prisma.invoice.findFirst({
        where:  { clientId: c.id, kind: InvoiceKind.ANNUAL, periodMonth: 0, periodYear: year },
        select: { id: true },
      })
      if (before) { skipped++; continue }

      await this.ensureAnnualInvoice(c.id, year, yearEndMonth, Number(c.annualBillingAmount), this.annualServices(c))
      created++
    }
    return { created, skipped }
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
