import {
  Controller, Get, Post, Patch, Put, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'
import { AttendanceService } from './attendance.service'
import { UpdateAttendanceDto } from './dto/update-attendance.dto'
import { Role } from '@ca-firm/shared'

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  // ── Weekend voluntary self-checkin ────────────────────────────────────────
  @Post('self-checkin')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  selfCheckin(@CurrentUser() user: any) {
    return this.svc.selfCheckin(user.id, user.role)
  }

  // ── My attendance (all roles except CLIENT) ────────────────────────────────
  @Get('my')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  getMyAttendance(
    @CurrentUser() user: any,
    @Query('month', new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) month: number,
    @Query('year',  new DefaultValuePipe(new Date().getFullYear()),  ParseIntPipe) year:  number,
  ) {
    return this.svc.getMyAttendance(user.id, month, year)
  }

  // ── Report (manager / partner) ─────────────────────────────────────────────
  @Get('report')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getReport(
    @CurrentUser() user: any,
    @Query('mode')   mode?: string,
    @Query('month',  new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) month: number = 0,
    @Query('year',   new DefaultValuePipe(new Date().getFullYear()),  ParseIntPipe) year:  number = 0,
    @Query('userId') userId?: string,
  ) {
    const all = mode === 'all'
    return this.svc.getReport(all ? null : month, all ? null : year, user.role, userId)
  }

  // ── Daily snapshot ─────────────────────────────────────────────────────────
  @Get('daily')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getDailyAttendance(
    @CurrentUser() user: any,
    @Query('date') date?: string,
  ) {
    const d = date ?? new Date().toISOString().split('T')[0]
    return this.svc.getDailyAttendance(d, user.role)
  }

  // ── Opening balance ────────────────────────────────────────────────────────
  @Get('opening')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getOpeningBalances() {
    return this.svc.getOpeningBalances()
  }

  @Put('opening/:userId')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  upsertOpeningBalance(
    @Param('userId') userId: string,
    @Body() body: { presents: number; late: number; absents: number; leaves: number; workingDays: number },
  ) {
    return this.svc.upsertOpeningBalance(userId, body)
  }

  // ── Applicability settings ─────────────────────────────────────────────────
  @Get('applicability')
  @Roles(Role.ADMIN, Role.PARTNER)
  getApplicability() {
    return this.svc.getApplicability()
  }

  @Patch('applicability/user/:userId')
  @Roles(Role.ADMIN, Role.PARTNER)
  setUserApplicability(@Param('userId') userId: string, @Body('applicable') applicable: boolean) {
    return this.svc.setUserApplicability(userId, applicable)
  }

  @Patch('applicability/role/:role')
  @Roles(Role.ADMIN, Role.PARTNER)
  setRoleApplicability(@Param('role') role: any, @Body('applicable') applicable: boolean) {
    return this.svc.setRoleApplicability(role, applicable)
  }

  // ── Get all settings ───────────────────────────────────────────────────────
  @Get('settings')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getSettings() {
    return this.svc.getSettings()
  }

  // ── Update a single setting ────────────────────────────────────────────────
  @Patch('settings/:key')
  @Roles(Role.ADMIN, Role.PARTNER)
  updateSetting(
    @Param('key') key: string,
    @Body('value') value: string,
    @Body('label') label?: string,
  ) {
    return this.svc.updateSetting(key, value, label)
  }

  // ── Create attendance for a specific user+date (admin/partner) ───────────────
  @Post('create')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  createAttendance(
    @Body('userId')  userId: string,
    @Body('date')    date:   string,
    @Body()          dto:    UpdateAttendanceDto,
    @CurrentUser()   user:   any,
  ) {
    return this.svc.createAttendance(userId, date, dto, user.id)
  }

  // ── Edit an attendance record ──────────────────────────────────────────────
  @Patch(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  updateAttendance(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateAttendance(id, dto, user.id)
  }

  // ── Approve / reject ──────────────────────────────────────────────────────
  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.approveAttendance(id, user.id, true)
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  reject(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.approveAttendance(id, user.id, false)
  }
}
