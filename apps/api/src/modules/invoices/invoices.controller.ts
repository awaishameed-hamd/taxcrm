import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '@ca-firm/shared'
import { InvoicesService } from './invoices.service'
import { CreateInvoiceDto, UpdateInvoiceDto, RecordPaymentDto, UpdateOpeningBalanceDto, ReceivePaymentDto } from './dto/invoice.dto'

// Billing is Manager-and-above only — Team Leads and Trainees never see it.
const BILLING_ROLES = [Role.ADMIN, Role.PARTNER, Role.MANAGER]

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...BILLING_ROLES)
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.list(status, clientId, search)
  }

  @Get('summary')
  summary() {
    return this.svc.summary()
  }

  @Get('clients')
  clients(@Query('search') search?: string) {
    return this.svc.clientsWithBalances(search)
  }

  @Get('ledger/:clientId')
  ledger(
    @Param('clientId') clientId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.clientLedger(clientId, from, to)
  }

  @Get('open/:clientId')
  openInvoices(@Param('clientId') clientId: string) {
    return this.svc.openInvoices(clientId)
  }

  @Post('receive-payment')
  receivePayment(@Req() req: any, @Body() dto: ReceivePaymentDto) {
    return this.svc.receivePayment(dto, req.user.id)
  }

  @Patch('opening-balance/:clientId')
  openingBalance(@Param('clientId') clientId: string, @Body() dto: UpdateOpeningBalanceDto) {
    return this.svc.setOpeningBalance(clientId, dto.openingBalance)
  }

  @Post('generate-retainers')
  generateRetainers(@Body('month') month: number, @Body('year') year: number) {
    const now = new Date()
    return this.svc.generateRetainerInvoices(month ?? now.getMonth() + 1, year ?? now.getFullYear())
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateInvoiceDto) {
    return this.svc.create(dto, req.user.id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.svc.update(id, dto)
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.svc.send(id)
  }

  @Post(':id/mark-retainer')
  markRetainer(@Param('id') id: string) {
    return this.svc.markRetainerIncluded(id)
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }

  @Post(':id/payments')
  recordPayment(@Req() req: any, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.svc.recordPayment(id, dto, req.user.id)
  }

  @Delete('payments/:paymentId')
  deletePayment(@Param('paymentId') paymentId: string) {
    return this.svc.deletePayment(paymentId)
  }
}
