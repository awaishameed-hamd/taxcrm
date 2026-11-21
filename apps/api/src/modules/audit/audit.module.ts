import { Module } from '@nestjs/common'
import { AuditService } from './audit.service'
import { AuditController } from './audit.controller'
import { InvoicesModule } from '../invoices/invoices.module'

@Module({
  // Signing off an engagement raises its invoice, so the audit module needs the
  // invoicing service the same way task completion does.
  imports: [InvoicesModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
