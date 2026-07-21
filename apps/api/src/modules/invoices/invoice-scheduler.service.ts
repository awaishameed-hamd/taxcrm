import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InvoicesService } from './invoices.service'

@Injectable()
export class InvoiceSchedulerService {
  private readonly logger = new Logger(InvoiceSchedulerService.name)

  constructor(private readonly invoices: InvoicesService) {}

  // Monthly retainer invoices: 1st of every month at 00:20, after the task
  // auto-creation jobs that run at :05/:10/:15.
  @Cron('20 0 1 * *')
  async handleMonthlyRetainers() {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()
    this.logger.log(`Auto-drafting retainer invoices for ${month}/${year}`)
    const result = await this.invoices.generateRetainerInvoices(month, year)
    this.logger.log(`Retainer invoices done: created=${result.created}, skipped=${result.skipped}`)
  }
}
