import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '@ca-firm/shared'
import { ClientLoginDetailsService } from './client-login-details.service'
import { UpdateLoginDetailDto, CreateClientWithLoginDto } from './dto/client-login-detail.dto'

// Equal access for every staff role — no permission gating, per business requirement.
const ALL = [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]

@Controller('client-login-details')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL)
export class ClientLoginDetailsController {
  constructor(private readonly svc: ClientLoginDetailsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.svc.list(search)
  }

  @Post()
  create(@Body() dto: CreateClientWithLoginDto) {
    return this.svc.createClientWithLogin(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLoginDetailDto) {
    return this.svc.update(id, dto)
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id)
  }
}
