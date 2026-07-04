import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common'
import { JwtAuthGuard }        from '../../common/guards/jwt-auth.guard'
import { RolesGuard }          from '../../common/guards/roles.guard'
import { Roles }               from '../../common/decorators/roles.decorator'
import { WorkingDaysService }  from './working-days.service'
import { AttendanceService }   from '../attendance/attendance.service'
import { SetupWorkingDaysDto } from './dto/setup-working-days.dto'
import { Role } from '@ca-firm/shared'

@Controller('working-days')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkingDaysController {
  constructor(
    private readonly svc:        WorkingDaysService,
    private readonly attendance: AttendanceService,
  ) {}

  // ── Get month setup ────────────────────────────────────────────────────────
  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getMonth(
    @Query('month', new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) month: number,
    @Query('year',  new DefaultValuePipe(new Date().getFullYear()),  ParseIntPipe) year:  number,
  ) {
    return this.svc.getMonth(month, year)
  }

  // ── Save month setup ───────────────────────────────────────────────────────
  @Post('setup')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  setup(@Body() dto: SetupWorkingDaysDto) {
    return this.svc.setupMonth(dto)
  }

  // ── Update login time for a date ───────────────────────────────────────────
  @Patch(':date/login-time')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  updateLoginTime(
    @Param('date') date: string,
    @Body('login_time') loginTime: string,
  ) {
    return this.svc.updateLoginTime(date, loginTime)
  }

  // ── Update a setting (e.g. late_margin_minutes) ────────────────────────────
  @Patch('settings/:key')
  @Roles(Role.ADMIN, Role.PARTNER)
  updateSetting(
    @Param('key') key: string,
    @Body('value') value: string,
  ) {
    return this.attendance.updateSetting(key, value)
  }
}
