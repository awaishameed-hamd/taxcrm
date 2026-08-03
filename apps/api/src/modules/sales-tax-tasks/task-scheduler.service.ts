import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SalesTaxTasksService } from './sales-tax-tasks.service'

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name)

  constructor(private readonly salesTaxTasksService: SalesTaxTasksService) {}

  // Sales Tax: 1st of every month at 00:05.
  // The return filed at the start of a month is for the PREVIOUS month, so the
  // run on 1 Aug creates July's tasks, not August's.
  @Cron('5 0 1 * *')
  async handleMonthlySalesTax() {
    const now   = new Date()
    const prev  = new Date(now.getFullYear(), now.getMonth() - 1, 1) // rolls Jan back to last Dec
    const month = prev.getMonth() + 1
    const year  = prev.getFullYear()
    this.logger.log(`Auto-creating Sales Tax tasks for ${month}/${year}`)
    const result = await this.salesTaxTasksService.createMonthlySalesTaxTasks(month, year)
    this.logger.log(`Sales Tax auto-create done: created=${result.created}, skipped=${result.skipped}`)
  }

  // WHT: 1st of Jan, Apr, Jul, Oct at 00:10.
  // The return filed at the start of a quarter is for the PREVIOUS quarter, so
  // the run on 1 Oct creates the Jul-Sep (Q3) tasks.
  @Cron('10 0 1 1,4,7,10 *')
  async handleQuarterlyWht() {
    const now = new Date()
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3)
    let quarter = currentQuarter - 1
    let year    = now.getFullYear()
    if (quarter < 1) { quarter = 4; year -= 1 } // Q1 run files last year's Q4
    this.logger.log(`Auto-creating WHT tasks for Q${quarter} ${year}`)
    const result = await this.salesTaxTasksService.createQuarterlyWhtTasks(quarter, year)
    this.logger.log(`WHT auto-create done: created=${result.created}, skipped=${result.skipped}`)
  }

  // Quarterly Advance Tax (Income Tax): 1st of Jan, Apr, Jul, Oct at 00:15
  @Cron('15 0 1 1,4,7,10 *')
  async handleQuarterlyAdvanceTax() {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()
    const quarter = Math.ceil(month / 3)
    this.logger.log(`Auto-creating Quarterly Advance Tax tasks for Q${quarter} ${year}`)
    const result = await this.salesTaxTasksService.createQuarterlyAdvanceTaxTasks(quarter, year)
    this.logger.log(`Advance Tax auto-create done: created=${result.created}, skipped=${result.skipped}`)
  }
}
