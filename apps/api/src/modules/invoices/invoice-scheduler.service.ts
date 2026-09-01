import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InvoicesService } from './invoices.service'

@Injectable()
export class InvoiceSchedulerService {
  private readonly logger = new Logger(InvoiceSchedulerService.name)

  constructor(private readonly invoices: InvoicesService) {}

  // Monthly retainer invoices: 1st of every month at 00:20, after the task
  // auto-creation jobs that run at :05/:10/:15.
  // A month's work is billed at the start of the next one, so the run on 1 Aug
  // raises July's retainer invoice.
  @Cron('20 0 1 * *')
  async handleMonthlyRetainers() {
    const now   = new Date()
    const prev  = new Date(now.getFullYear(), now.getMonth() - 1, 1) // rolls Jan back to last Dec
    const month = prev.getMonth() + 1
    const year  = prev.getFullYear()
    this.logger.log(`Auto-drafting retainer invoices for ${month}/${year}`)
    const result = await this.invoices.generateRetainerInvoices(month, year)
    this.logger.log(`Retainer invoices done: created=${result.created}, skipped=${result.skipped}`)
  }

  // Annual billing invoices: 1st of every month at 00:25, right after the
  // retainer run. Only clients whose fiscal year ended last month are billed, so
  // a June year end raises its invoice on 1 July and stays quiet the rest of the
  // year. The period year is the calendar year that year end fell in.
  @Cron('25 0 1 * *')
  async handleAnnualBilling() {
    const now  = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1) // rolls Jan back to last Dec
    const yearEndMonth = prev.getMonth() + 1
    const year         = prev.getFullYear()
    this.logger.log(`Auto-drafting annual billing invoices for year ends in ${yearEndMonth}/${year}`)
    const result = await this.invoices.generateAnnualInvoices(yearEndMonth, year)
    this.logger.log(`Annual billing invoices done: created=${result.created}, skipped=${result.skipped}`)
  }
}
