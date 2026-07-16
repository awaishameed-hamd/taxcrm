import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { SalesTaxTasksController } from './sales-tax-tasks.controller'
import { SalesTaxTasksService } from './sales-tax-tasks.service'
import { TaskSchedulerService } from './task-scheduler.service'
import { PipelineStepsModule } from '../pipeline-steps/pipeline-steps.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { ChatModule } from '../chat/chat.module'
import { FbrModule } from '../fbr/fbr.module'
import { InvoicesModule } from '../invoices/invoices.module'

@Module({
  imports: [ScheduleModule.forRoot(), PipelineStepsModule, NotificationsModule, ChatModule, FbrModule, InvoicesModule],
  controllers: [SalesTaxTasksController],
  providers: [SalesTaxTasksService, TaskSchedulerService],
  exports: [SalesTaxTasksService],
})
export class SalesTaxTasksModule {}
