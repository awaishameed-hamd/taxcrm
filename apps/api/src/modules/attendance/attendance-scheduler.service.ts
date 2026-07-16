import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DayType, AttendanceStatus, Role } from '@prisma/client'
import { PrismaService }    from '../prisma/prisma.service'
import { AttendanceService } from './attendance.service'

// Attendance is a firm-staff concept only — Clients (and Representatives) must never be marked
const INTERNAL_STAFF_ROLES: Role[] = [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]

@Injectable()
export class AttendanceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceSchedulerService.name)

  constructor(
    private prisma:     PrismaService,
    private attendance: AttendanceService,
  ) {}

  async onModuleInit() {
    // v3 flag — re-runs after fixing weekend + pre-createdAt logic
    const flag = await this.prisma.attendanceSetting.findUnique({ where: { key: 'absent_backfill_v3_done' } })
    if (flag) return

    this.logger.log('[BackfillAbsent] Cleaning up incorrectly marked absent records…')

    // Fetch all auto-absent records (no loginTime = system-generated)
    const wrongRecords = await this.prisma.attendance.findMany({
      where:  { status: 'ABSENT', loginTime: null },
      select: { id: true, date: true, workingDayId: true, userId: true },
    })

    // Fetch user createdAt map
    const userRows = await this.prisma.user.findMany({ select: { id: true, createdAt: true } })
    const createdAtMap = new Map(userRows.map(u => [u.id, u.createdAt]))

    const idsToDelete: string[] = []
    for (const r of wrongRecords) {
      const dow = r.date.getUTCDay()

      // Wrong: weekend day not explicitly WORKING_DAY
      if (dow === 0 || dow === 6) {
        if (r.workingDayId) {
          const wd = await this.prisma.workingDay.findUnique({ where: { id: r.workingDayId }, select: { dayType: true } })
          if (wd?.dayType === 'WORKING_DAY') continue
        }
        idsToDelete.push(r.id)
        continue
      }

      // Wrong: date is before the user was created
      const userCreated = createdAtMap.get(r.userId)
      if (userCreated) {
        const createdDay = new Date(userCreated)
        createdDay.setUTCHours(0, 0, 0, 0)
        if (r.date < createdDay) {
          idsToDelete.push(r.id)
          continue
        }
      }
    }

    if (idsToDelete.length > 0) {
      await this.prisma.attendance.deleteMany({ where: { id: { in: idsToDelete } } })
      this.logger.log(`[BackfillAbsent] Removed ${idsToDelete.length} wrong absent records`)
    }

    // Run the corrected backfill
    this.logger.log('[BackfillAbsent] Running corrected absent backfill…')
    const { created } = await this.attendance.backfillAbsent()
    this.logger.log(`[BackfillAbsent] Done — ${created} records created`)

    await this.prisma.attendanceSetting.upsert({
      where:  { key: 'absent_backfill_v3_done' },
      update: { value: 'true' },
      create: { key: 'absent_backfill_v3_done', value: 'true', label: 'Absent backfill v3 completed' },
    })
  }

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
        where:  { isActive: true, attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
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

      // Mark each as PRESENT with loginTime = reporting_time (not their actual early login).
      // skipDuplicates makes this idempotent: the API runs as multiple cluster workers, so this
      // cron fires once per worker and they race on the same (userId, date) unique index.
      const { count } = await this.prisma.attendance.createMany({
        data: toMark.map(userId => ({
          userId,
          workingDayId:   workingDay?.id ?? undefined,
          date:           today,
          loginTime:      reportingTimeUtc,
          status:         AttendanceStatus.PRESENT,
          isLate:         false,
          lateMinutes:    null,
          approvalStatus: 'pending',
        })),
        skipDuplicates: true,
      })

      this.logger.log(`[AutoAttendance] Marked ${count} early-login users as PRESENT`)
    } catch (err) {
      this.logger.error('[AutoAttendance] Batch mark failed', err)
    }
  }

  // Runs every minute — marks absent at cutoff_time for users with no record today
  @Cron('* * * * *')
  async autoMarkAbsent() {
    try {
      const settings = await this.attendance.getSettings()
      if (settings.auto_mark_on_login !== 'true') return

      const tz             = settings.timezone
      const cutoffTime     = settings.cutoff_time ?? '23:59'
      const { dateStr, timeStr } = this.nowInTz(tz)

      // Only fire at the exact cutoff minute
      if (timeStr !== cutoffTime) return

      this.logger.log(`[AutoAbsent] Running absent sweep for ${dateStr}`)

      const today      = new Date(dateStr + 'T00:00:00Z')
      const dayOfWeek  = today.getDay()
      const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })
      const resolvedType = workingDay?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)

      // Only auto-absent on mandatory working days — weekends are voluntary
      if (resolvedType !== DayType.WORKING_DAY) {
        this.logger.log('[AutoAbsent] Not a working day — skipping')
        return
      }

      // All applicable users
      const users = await this.prisma.user.findMany({
        where:  { isActive: true, attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
        select: { id: true },
      })
      const userIds = users.map(u => u.id)
      if (userIds.length === 0) return

      // Users already have a record today
      const existing = await this.prisma.attendance.findMany({
        where:  { date: today, userId: { in: userIds } },
        select: { userId: true },
      })
      const markedSet = new Set(existing.map(r => r.userId))

      const toAbsent = userIds.filter(id => !markedSet.has(id))
      if (toAbsent.length === 0) {
        this.logger.log('[AutoAbsent] All users already have a record today')
        return
      }

      // skipDuplicates makes this idempotent: the API runs as multiple cluster workers, so this
      // cron fires once per worker and they race on the same (userId, date) unique index.
      const { count } = await this.prisma.attendance.createMany({
        data: toAbsent.map(userId => ({
          userId,
          workingDayId:   workingDay?.id ?? undefined,
          date:           today,
          loginTime:      null,
          status:         AttendanceStatus.ABSENT,
          isLate:         false,
          lateMinutes:    null,
          approvalStatus: 'pending',
        })),
        skipDuplicates: true,
      })

      this.logger.log(`[AutoAbsent] Marked ${count} users as ABSENT`)
    } catch (err) {
      this.logger.error('[AutoAbsent] Sweep failed', err)
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
