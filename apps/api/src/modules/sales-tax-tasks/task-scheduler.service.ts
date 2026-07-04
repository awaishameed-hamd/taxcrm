import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SalesTaxTasksService } from './sales-tax-tasks.service'

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name)

  constructor(private readonly salesTaxTasksService: SalesTaxTasksService) {}

  // Sales Tax: 1st of every month at 00:05
  @Cron('5 0 1 * *')
  async handleMonthlySalesTax() {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()
    this.logger.log(`Auto-creating Sales Tax tasks for ${month}/${year}`)
    const result = await this.salesTaxTasksService.createMonthlySalesTaxTasks(month, year)
    this.logger.log(`Sales Tax auto-create done: created=${result.created}, skipped=${result.skipped}`)
  }

  // WHT: 1st of Jan, Apr, Jul, Oct at 00:10
  @Cron('10 0 1 1,4,7,10 *')
  async handleQuarterlyWht() {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()
    // Determine quarter number from month
    const quarter = Math.ceil(month / 3)
    this.logger.log(`Auto-creating WHT tasks for Q${quarter} ${year}`)
    const result = await this.salesTaxTasksService.createQuarterlyWhtTasks(quarter, year)
    this.logger.log(`WHT auto-create done: created=${result.created}, skipped=${result.skipped}`)
  }
}
