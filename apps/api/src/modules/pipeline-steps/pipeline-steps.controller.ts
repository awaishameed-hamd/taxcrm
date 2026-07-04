import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { PipelineStepsService } from './pipeline-steps.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'

@Controller('pipeline-steps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PipelineStepsController {
  constructor(private readonly service: PipelineStepsService) {}

  // Any role can read step configs (used by TasksPage to display labels)
  @Get()
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD, Role.ADMIN, Role.PARTNER)
  list(@Query('taskType') taskType: string) {
    return this.service.listByTaskType(taskType ?? 'SALES_TAX')
  }

  // Admin/Partner can add a new custom step
  @Post()
  @Roles(Role.ADMIN, Role.PARTNER)
  create(@Body() dto: { taskType: string; label: string; description?: string; approvedBy?: string }) {
    return this.service.createStep(dto)
  }

  // Admin/Partner can update a step
  @Put(':id')
  @Roles(Role.ADMIN, Role.PARTNER)
  update(@Param('id') id: string, @Body() dto: { label?: string; description?: string; approvedBy?: string; isActive?: boolean }) {
    return this.service.updateStep(id, dto)
  }

  // Admin/Partner can reorder steps
  @Put('reorder/batch')
  @Roles(Role.ADMIN, Role.PARTNER)
  reorder(@Body() body: { ids: string[] }) {
    return this.service.reorder(body.ids)
  }
}
