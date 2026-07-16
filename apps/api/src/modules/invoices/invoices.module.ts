import { Module } from '@nestjs/common'
import { InvoicesService } from './invoices.service'
import { InvoicesController } from './invoices.controller'
import { InvoiceSchedulerService } from './invoice-scheduler.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports:     [PrismaModule],
  controllers: [InvoicesController],
  providers:   [InvoicesService, InvoiceSchedulerService],
  exports:     [InvoicesService],
})
export class InvoicesModule {}
