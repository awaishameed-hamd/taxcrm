import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DayType, AttendanceStatus } from '@prisma/client'
import { PrismaService }    from '../prisma/prisma.service'
import { AttendanceService } from './attendance.service'

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name)

  constructor(
    private prisma:     PrismaService,
    private attendance: AttendanceService,
  ) {}

  // Runs every minute — fires the batch mark exactly at the reporting_time
  @Cron('* * * * *')
  async batchMarkEarlyLogins() {
    try {
      const settings = await this.attendance.getSettings()
      if (settings.auto_mark_on_login !== 'true') return

      const tz             = settings.timezone
      const reportingTime  = settings.reporting_time   // e.g. '09:00'
      const { dateStr, timeStr } = this.nowInTz(tz)

      // Only fire at the exact reporting minute
      if (timeStr !== reportingTime) return

      this.logger.log(`[AutoAttendance] Batch marking early logins for ${dateStr} at ${reportingTime} ${tz}`)

      const today     = new Date(dateStr + 'T00:00:00Z')
      const dayOfWeek = today.getDay()
      const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })
      const resolvedType = workingDay?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
      if (resolvedType !== DayType.WORKING_DAY) {
        this.logger.log('[AutoAttendance] Not a working day — skipping batch mark')
        return
      }

      // Build UTC boundary for "today in PKT" and "reporting_time in PKT"
      const [rh, rm]         = reportingTime.split(':').map(Number)
      const todayStartUtc    = this.localToUtc(dateStr, 0,  0,  tz)
      const reportingTimeUtc = this.localToUtc(dateStr, rh, rm, tz)

      // All eligible users
      const users = await this.prisma.user.findMany({
        where:  { isActive: true, attendanceApplicable: true },
        select: { id: true },
      })
      const userIds = users.map(u => u.id)
      if (userIds.length === 0) return

      // Users already marked today
      const alreadyMarked = await this.prisma.attendance.findMany({
        where:  { date: today, userId: { in: userIds } },
        select: { userId: true },
      })
      const markedSet = new Set(alreadyMarked.map(r => r.userId))

      // Users who logged in today BEFORE reporting_time (valid refresh token created in window)
      const earlyTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId:    { in: userIds },
          createdAt: { gte: todayStartUtc, lt: reportingTimeUtc },
          expiresAt: { gt: new Date() },
        },
        select:   { userId: true },
        distinct: ['userId'],
      })

      const toMark = earlyTokens.map(t => t.userId).filter(id => !markedSet.has(id))
      if (toMark.length === 0) {
        this.logger.log('[AutoAttendance] No early-login users to mark')
        return
      }

      // Mark each as PRESENT with loginTime = reporting_time (not their actual early login)
      await this.prisma.$transaction(
        toMark.map(userId =>
          this.prisma.attendance.create({
            data: {
              userId,
              workingDayId:   workingDay?.id ?? undefined,
              date:           today,
              loginTime:      reportingTimeUtc,
              status:         AttendanceStatus.PRESENT,
              isLate:         false,
              lateMinutes:    null,
              approvalStatus: 'pending',
            },
          })
        )
      )

      this.logger.log(`[AutoAttendance] Marked ${toMark.length} early-login users as PRESENT`)
    } catch (err) {
      this.logger.error('[AutoAttendance] Batch mark failed', err)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private nowInTz(tz: string): { dateStr: string; timeStr: string } {
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, timeStr: `${get('hour')}:${get('minute')}` }
  }

  // Convert a local (tz) hour:minute on dateStr to a UTC Date
  private localToUtc(dateStr: string, hour: number, minute: number, tz: string): Date {
    // Probe at noon UTC to get the offset for that date in that timezone
    const probe  = new Date(`${dateStr}T12:00:00Z`)
    const parts  = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(probe)
    const get    = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10)
    // local time of the probe = get('hour'):get('minute')  → offset = local - 12:00 (UTC)
    const offsetMins = (get('hour') * 60 + get('minute')) - (12 * 60 + 0)
    // UTC = local - offset
    const targetMinsUTC = hour * 60 + minute - offsetMins
    return new Date(new Date(dateStr + 'T00:00:00Z').getTime() + targetMinsUTC * 60 * 1000)
  }
}
