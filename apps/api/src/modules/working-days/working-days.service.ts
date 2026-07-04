import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { DayType } from '@prisma/client'
import { SetupWorkingDaysDto } from './dto/setup-working-days.dto'
import { AttendanceService } from '../attendance/attendance.service'

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

@Injectable()
export class WorkingDaysService {
  constructor(
    private prisma:      PrismaService,
    private attendance:  AttendanceService,
  ) {}

  // ── Get working days for a month ────────────────────────────────────────────

  async getMonth(month: number, year: number) {
    const startDate = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00Z`)
    const endDate   = new Date(year, month, 1)
    const today     = new Date().toISOString().split('T')[0]

    // Check if this month has been set up
    const existing = await this.prisma.workingDay.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      orderBy: { date: 'asc' },
    })

    const wdMap   = new Map(existing.map(d => [d.date.toISOString().split('T')[0], d]))

    // Build the full month scaffold
    const daysInMonth = new Date(year, month, 0).getDate()
    const settings    = await this.attendance.getSettings()

    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr   = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const dayOfWeek = new Date(dateStr).getDay()
      const existing  = wdMap.get(dateStr)

      const dayType = existing?.dayType
        ?? (dayOfWeek === 0 || dayOfWeek === 6 ? DayType.WEEKEND : DayType.WORKING_DAY)

      days.push({
        date:                  dateStr,
        day_name:              DAY_NAMES[dayOfWeek],
        status:                this.dayTypeToStatus(dayType),
        dayType,
        leave_reason:          existing?.leaveReason ?? null,
        login_time_formatted:  existing?.reportingTimeOverride ?? settings.reporting_time,
        is_locked:             dateStr < this.yesterday(),
      })
    }

    return {
      days,
      late_margin: parseInt(settings.grace_period_minutes, 10) || 15,
      reporting_time: settings.reporting_time,
      cutoff_time:    settings.cutoff_time,
    }
  }

  // ── Save / update a month setup ─────────────────────────────────────────────

  async setupMonth(dto: SetupWorkingDaysDto) {
    const ops = dto.days.map(d => {
      const date = new Date(d.date + 'T00:00:00Z')
      return this.prisma.workingDay.upsert({
        where:  { date },
        update: {
          dayType:               d.dayType,
          leaveReason:           d.leaveReason ?? null,
          reportingTimeOverride: d.reportingTimeOverride ?? null,
        },
        create: {
          date,
          dayType:               d.dayType,
          leaveReason:           d.leaveReason ?? null,
          reportingTimeOverride: d.reportingTimeOverride ?? null,
        },
      })
    })

    await this.prisma.$transaction(ops)
    return { message: `Working days for month ${dto.month}/${dto.year} saved successfully.` }
  }

  // ── Update login time for a specific date (carry-forward in UI) ─────────────

  async updateLoginTime(date: string, loginTime: string) {
    const d = new Date(date + 'T00:00:00Z')
    return this.prisma.workingDay.upsert({
      where:  { date: d },
      update: { reportingTimeOverride: loginTime },
      create: { date: d, dayType: DayType.WORKING_DAY, reportingTimeOverride: loginTime },
    })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private dayTypeToStatus(dayType: DayType): string {
    if (dayType === DayType.WEEKEND) return 'weekend'
    if (dayType === DayType.HOLIDAY) return 'leave'
    return 'working_day'
  }

  private yesterday(): string {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }
}
