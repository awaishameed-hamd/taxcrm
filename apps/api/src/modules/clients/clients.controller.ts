import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards, Delete } from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { ClientsService } from './clients.service'
import { UpdateClientProfileDto } from './dto/update-client-profile.dto'
import { CreateClientDto } from './dto/create-client.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  findAll(
    @CurrentUser() user: { id: string; role: Role },
    @Query('search') search?: string,
  ) {
    return this.clientsService.findAll(user.id, user.role, search)
  }

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto)
  }

  // Bulk import from the Excel template. Rows are parsed in the browser, so this
  // takes a plain array and reports per-row failures.
  @Post('bulk')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  bulk(@Body() body: { rows: any[] }) {
    return this.clientsService.bulkCreateClients(body?.rows ?? [])
  }

  @Get('my-profile')
  @Roles(Role.CLIENT)
  myProfile(@CurrentUser() user: { id: string }) {
    return this.clientsService.findByUserId(user.id)
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.clientsService.findOne(id, user.id, user.role)
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  update(@Param('id') id: string, @Body() dto: UpdateClientProfileDto) {
    return this.clientsService.updateProfile(id, dto)
  }

  @Patch(':id/toggle-active')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  toggleActive(@Param('id') id: string) {
    return this.clientsService.toggleActive(id)
  }

  @Patch(':id/toggle-portal')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  togglePortal(@Param('id') id: string) {
    return this.clientsService.togglePortalAccess(id)
  }

  @Post(':id/send-invite')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  sendInvite(@Param('id') id: string) {
    return this.clientsService.sendInvite(id)
  }

  // Irreversible, so it stops at Manager. Team Leads and Trainees deactivate instead.
  @Delete(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id)
  }
}
