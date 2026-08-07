import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '@ca-firm/shared'
import { SalesTaxTasksService } from './sales-tax-tasks.service'
import { AdvanceTaskDto } from './dto/advance-task.dto'
import { ManagerApproveDto, ManagerSendBackDto } from './dto/manager-action.dto'
import { CreateSalesTaxTaskDto } from './dto/create-sales-tax-task.dto'

@Controller('sales-tax-tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesTaxTasksController {
  constructor(private readonly service: SalesTaxTasksService) {}

  // Attachments are uploaded straight to Backblaze by the browser, see
  // POST /files/presign-upload. Nothing is written to this server's disk.

  // ── Manager/Admin: create a single task manually ───────────────────────────
  @Post()
  @Roles(Role.TRAINEE, Role.MANAGER, Role.ADMIN, Role.PARTNER, Role.TEAM_LEAD)
  createOne(@Req() req: any, @Body() dto: CreateSalesTaxTaskDto) {
    return this.service.createSingle(dto, req.user.id, req.user.role)
  }

  // ── Summary counts for tab badges ─────────────────────────────────────────
  @Get('summary-counts')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.ADMIN, Role.PARTNER, Role.TEAM_LEAD)
  summaryCounts(@Req() req: any, @Query('view') view?: string) {
    return this.service.summaryCounts(req.user.id, req.user.role, view)
  }

  // ── Any role: list tasks assigned to me ───────────────────────────────────
  @Get('my')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.ADMIN, Role.PARTNER, Role.TEAM_LEAD)
  listMine(@Req() req: any, @Query('status') status?: string, @Query('taskType') taskType?: string) {
    return this.service.listForTrainee(req.user.id, status, taskType, req.user.role)
  }

  // ── Manager/TeamLead/Partner: list tasks pending approval ──────────────────
  @Get('approvals')
  @Roles(Role.MANAGER, Role.ADMIN, Role.PARTNER, Role.TEAM_LEAD)
  listApprovals(@Req() req: any, @Query('status') status?: string, @Query('all') all?: string, @Query('taskType') taskType?: string) {
    const { id: userId, role } = req.user
    if (all === 'true') return this.service.listAll(taskType, userId, role)
    return this.service.listForManager(status, taskType, userId, role)
  }

  // ── Any authorized role: get one task ──────────────────────────────────────
  @Get(':id')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.ADMIN, Role.PARTNER, Role.TEAM_LEAD)
  getOne(@Param('id') id: string) {
    return this.service.getOne(id)
  }

  // ── Trainee (or manager acting on own task): advance to next step ────────
  @Post(':id/advance')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD, Role.PARTNER, Role.ADMIN)
  advance(@Param('id') id: string, @Req() req: any, @Body() dto: AdvanceTaskDto) {
    return this.service.advanceByTrainee(id, req.user.id, dto)
  }

  // ── Trainee OR Manager: mark client review done ────────────────────────────
  @Post(':id/client-reviewed')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD)
  clientReviewed(@Param('id') id: string, @Req() req: any, @Body('comment') comment?: string) {
    return this.service.markClientReviewed(id, req.user.id, comment)
  }

  // ── Manager: approve step 5 or 7 ───────────────────────────────────────────
  @Post(':id/approve')
  @Roles(Role.MANAGER, Role.TEAM_LEAD)
  approve(@Param('id') id: string, @Req() req: any, @Body() dto: ManagerApproveDto) {
    return this.service.managerApprove(id, req.user.id, dto)
  }

  // ── Manager: send back to trainee ──────────────────────────────────────────
  @Post(':id/send-back')
  @Roles(Role.MANAGER, Role.TEAM_LEAD)
  sendBack(@Param('id') id: string, @Req() req: any, @Body() dto: ManagerSendBackDto) {
    return this.service.managerSendBack(id, req.user.id, dto)
  }

  // ── Trainee (or manager acting on own task): re-submit after sent back ────
  @Post(':id/resubmit')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD, Role.PARTNER, Role.ADMIN)
  reSubmit(@Param('id') id: string, @Req() req: any, @Body() dto: AdvanceTaskDto) {
    return this.service.reSubmit(id, req.user.id, dto)
  }

  // ── Trainee: undo last completed step ──────────────────────────────────────
  @Post(':id/revert')
  @Roles(Role.TRAINEE)
  revert(@Param('id') id: string, @Req() req: any) {
    return this.service.revertLastStep(id, req.user.id)
  }

  // ── Trainee / Manager: skip a fixed step ──────────────────────────────────
  @Post(':id/skip-step')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD)
  skipStep(@Param('id') id: string, @Req() req: any, @Body('stepKey') stepKey: string) {
    return this.service.skipFixedStep(id, req.user.id, stepKey, req.user.role)
  }

  // ── Trainee / Manager: add a custom step ──────────────────────────────────
  @Post(':id/custom-steps')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD)
  addCustomStep(@Param('id') id: string, @Req() req: any, @Body() dto: any) {
    return this.service.addCustomStep(id, req.user.id, dto, req.user.role)
  }

  // ── Trainee / Manager: delete a custom step ────────────────────────────────
  @Delete(':id/custom-steps/:stepId')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.TEAM_LEAD)
  deleteCustomStep(@Param('id') id: string, @Param('stepId') stepId: string, @Req() req: any) {
    return this.service.deleteCustomStep(id, stepId, req.user.id, req.user.role)
  }

  // ── Trainee or Manager: complete a custom step ─────────────────────────────
  @Post(':id/custom-steps/:stepId/complete')
  @Roles(Role.TRAINEE, Role.MANAGER, Role.ADMIN, Role.PARTNER, Role.TEAM_LEAD)
  completeCustomStep(@Param('id') id: string, @Param('stepId') stepId: string, @Req() req: any) {
    return this.service.completeCustomStep(id, stepId, req.user.id, req.user.role)
  }

  // ── Admin/Partner/Manager: delete a completed task ────────────────────────────
  @Delete(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  deleteTask(@Param('id') id: string) {
    return this.service.adminDeleteTask(id)
  }

  // ── Admin/Partner/Manager: revert completed task back to incomplete ────────────
  @Post(':id/revert-to-incomplete')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  revertToIncomplete(@Param('id') id: string, @Req() req: any) {
    return this.service.adminRevertToIncomplete(id, req.user.id)
  }

  // ── Admin/Partner: manually trigger monthly Sales Tax task creation ───────────
  @Post('admin/create-monthly-sales-tax')
  @Roles(Role.ADMIN, Role.PARTNER)
  createMonthlySalesTax(@Body('month') month: number, @Body('year') year: number) {
    return this.service.createMonthlySalesTaxTasks(month, year)
  }

  // ── Admin/Partner: manually trigger quarterly WHT task creation ───────────────
  @Post('admin/create-quarterly-wht')
  @Roles(Role.ADMIN, Role.PARTNER)
  createQuarterlyWht(@Body('quarter') quarter: number, @Body('year') year: number) {
    return this.service.createQuarterlyWhtTasks(quarter, year)
  }

  // ── Admin/Partner: manually trigger quarterly Advance Tax task creation ───────
  @Post('admin/create-quarterly-advance-tax')
  @Roles(Role.ADMIN, Role.PARTNER)
  createQuarterlyAdvanceTax(@Body('quarter') quarter: number, @Body('year') year: number) {
    return this.service.createQuarterlyAdvanceTaxTasks(quarter, year)
  }
}
