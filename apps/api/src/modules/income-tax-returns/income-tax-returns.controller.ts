import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Roles } from '../../common/decorators/roles.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Role } from '@ca-firm/shared'
import { IncomeTaxReturnsService } from './income-tax-returns.service'
import { UpsertIncomeTaxReturnDto } from './dto/upsert-income-tax-return.dto'

@Controller('income-tax-returns')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class IncomeTaxReturnsController {
  constructor(private svc: IncomeTaxReturnsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  upsert(@Req() req: any, @Body() dto: UpsertIncomeTaxReturnDto) {
    return this.svc.upsert(dto, req.user.id, req.user.role)
  }

  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  find(@Req() req: any, @Query('clientId') clientId: string) {
    return this.svc.findByClient(clientId, req.user.id, req.user.role)
  }
}
