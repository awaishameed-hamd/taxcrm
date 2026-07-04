import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ClientRepresentativesService, CreateRepDto, UpdateRepDto } from './client-representatives.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '@ca-firm/shared'

@Controller('client-representatives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientRepresentativesController {
  constructor(private svc: ClientRepresentativesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  findAll() { return this.svc.findAll() }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  create(@Body() dto: CreateRepDto) { return this.svc.create(dto) }

  @Put(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  update(@Param('id') id: string, @Body() dto: UpdateRepDto) { return this.svc.update(id, dto) }

  @Patch(':id/toggle-active')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  toggleActive(@Param('id') id: string) { return this.svc.toggleActive(id) }

  @Patch(':id/toggle-portal')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  togglePortal(@Param('id') id: string, @Body() body: { password?: string }) {
    return this.svc.togglePortal(id, body?.password)
  }

  @Post(':id/send-invite')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  sendInvite(@Param('id') id: string) { return this.svc.sendInvite(id) }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PARTNER)
  remove(@Param('id') id: string) { return this.svc.remove(id) }
}
