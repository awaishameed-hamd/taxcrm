import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  getStats(
    @CurrentUser() user: { id: string; role: Role },
    @Query('period') period?: 'daily' | 'weekly' | 'monthly' | 'custom',
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ) {
    return this.dashboardService.getStats(user.id, user.role, period, fromDate, toDate)
  }
}
