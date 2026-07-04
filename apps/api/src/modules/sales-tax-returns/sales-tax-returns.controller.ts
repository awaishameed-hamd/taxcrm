import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Roles } from '../../common/decorators/roles.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Role } from '@ca-firm/shared'
import { SalesTaxReturnsService } from './sales-tax-returns.service'
import { UpsertSalesTaxReturnDto } from './dto/upsert-sales-tax-return.dto'

@Controller('sales-tax-returns')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SalesTaxReturnsController {
  constructor(private svc: SalesTaxReturnsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  upsert(@Body() dto: UpsertSalesTaxReturnDto) {
    return this.svc.upsert(dto)
  }

  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  find(@Query('clientId') clientId: string, @Query('authority') authority?: string) {
    return this.svc.findByClient(clientId, authority)
  }
}
