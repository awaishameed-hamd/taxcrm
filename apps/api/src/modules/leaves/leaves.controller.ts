import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'
import { LeavesService } from './leaves.service'
import { CreateLeaveDto } from './dto/create-leave.dto'
import { Role } from '@ca-firm/shared'

@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeavesController {
  constructor(private readonly svc: LeavesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  apply(@CurrentUser() user: any, @Body() dto: CreateLeaveDto) {
    return this.svc.apply(user.id, dto)
  }

  @Get('my')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  getMyLeaves(@CurrentUser() user: any) {
    return this.svc.getMyLeaves(user.id)
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  getPending(@CurrentUser() user: any) {
    return this.svc.getPending(user.role)
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  getAll(@CurrentUser() user: any) {
    return this.svc.getAll(user.role)
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.approve(id, user.id, user.role)
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  reject(@Param('id') id: string, @CurrentUser() user: any, @Body('reason') reason?: string) {
    return this.svc.reject(id, user.id, user.role, reason)
  }
}
