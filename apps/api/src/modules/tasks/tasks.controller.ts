import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '@ca-firm/shared'
import { TasksService } from './tasks.service'
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto'

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  list(@Req() req: any, @Query('taxType') taxType?: string, @Query('status') status?: string) {
    return this.service.listTasks(req.user.id, req.user.role, taxType, status)
  }

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  create(@Req() req: any, @Body() dto: CreateTaskDto) {
    return this.service.createTask(req.user.id, req.user.role, dto)
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateTaskDto) {
    return this.service.updateTask(id, req.user.id, req.user.role, dto)
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.deleteTask(id, req.user.id, req.user.role)
  }

  @Get('assignable-users')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  assignableUsers(@Req() req: any) {
    return this.service.getAssignableUsers(req.user.id, req.user.role)
  }

  @Get('clients')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  clients(@Req() req: any) {
    return this.service.getClients(req.user.id, req.user.role)
  }
}
