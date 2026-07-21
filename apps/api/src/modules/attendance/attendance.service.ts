import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AttendanceStatus, DayType, Role } from '@prisma/client'
import { UpdateAttendanceDto } from './dto/update-attendance.dto'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// Attendance is a firm-staff concept only. Clients (and Representatives) must never appear in it,
// no matter what their attendanceApplicable flag says.
const INTERNAL_STAFF_ROLES: Role[] = [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]

// ── Default settings (used when DB has no row) ────────────────────────────────
export const DEFAULT_SETTINGS = {
  reporting_time:       '09:00',  // earliest time attendance can be marked (attendance window start)
  login_time:           '10:00',  // official office time, late is calculated relative to this
  grace_period_minutes: '15',
  cutoff_time:          '18:00',
  auto_mark_on_login:   'true',
  timezone:             'Asia/Karachi',
}

// ── Settings cache, refreshed every 5 minutes ────────────────────────────────
let settingsCache: Record<string, string> | null = null
let settingsCacheAt = 0

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // ── Settings helpers ────────────────────────────────────────────────────────

  async getSettings(): Promise<Record<string, string>> {
    const now = Date.now()
    if (settingsCache && now - settingsCacheAt < 5 * 60 * 1000) return settingsCache

    const rows = await this.prisma.attendanceSetting.findMany()
    const map: Record<string, string> = { ...DEFAULT_SETTINGS }
    for (const r of rows) map[r.key] = r.value
    settingsCache   = map
    settingsCacheAt = now
    return map
  }

  async updateSetting(key: string, value: string, label?: string) {
    settingsCache = null  // invalidate cache

    const result = await this.prisma.attendanceSetting.upsert({
      where:  { key },
      update: { value, ...(label ? { label } : {}) },
      create: { key, value, label: label ?? key },
    })

    // When login_time changes, propagate to all future working days
    if (key === 'login_time') {
      const todayUtc = new Date()
      todayUtc.setUTCHours(0, 0, 0, 0)
      await this.prisma.workingDay.updateMany({
        where: { date: { gte: todayUtc } },
        data:  { reportingTimeOverride: value },
      })
    }

    return result
  }

  // ── Timezone-aware date helpers ─────────────────────────────────────────────

  private getDateInTimezone(tz: string): { dateStr: string; timeStr: string } {
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)

    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    return {
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
      timeStr: `${get('hour')}:${get('minute')}`,
    }
  }

  // Compare "HH:MM" strings; returns minutes difference (positive = over)
  private minutesDiff(time: string, base: string): number {
    const [th, tm] = time.split(':').map(Number)
    const [bh, bm] = base.split(':').map(Number)
    return (th * 60 + tm) - (bh * 60 + bm)
  }

  // ── Auto-mark attendance on login ───────────────────────────────────────────

  // ── Applicability (which users/roles have attendance) ──────────────────────

  async getApplicability() {
    const users = await this.prisma.user.findMany({
      where: { role: { notIn: [Role.CLIENT] }, isActive: true },
      select: { id: true, fullName: true, userCode: true, role: true, attendanceApplicable: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    })
    // Group by role
    const grouped: Record<string, { id: string; fullName: string; userCode: string; role: string; attendanceApplicable: boolean }[]> = {}
    for (const u of users) {
      if (!grouped[u.role]) grouped[u.role] = []
      grouped[u.role].push(u)
    }
    return grouped
  }

  async setUserApplicability(userId: string, applicable: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { attendanceApplicable: applicable },
      select: { id: true, attendanceApplicable: true },
    })
  }

  async setRoleApplicability(role: Role, applicable: boolean) {
    await this.prisma.user.updateMany({
      where: { role, isActive: true },
      data:  { attendanceApplicable: applicable },
    })
    return { role, attendanceApplicable: applicable }
  }

  async autoMarkOnLogin(userId: string, userRole: Role) {
    // Clients don't have attendance
    if (userRole === Role.CLIENT) return null

    // Check if attendance is applicable for this user
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { attendanceApplicable: true } })
    if (!user?.attendanceApplicable) return null

    const settings = await this.getSettings()
    if (settings.auto_mark_on_login !== 'true') return null

    const tz                    = settings.timezone
    const { dateStr, timeStr }  = this.getDateInTimezone(tz)
    const cutoff                = settings.cutoff_time

    // Past cutoff, do not auto-mark
    if (this.minutesDiff(timeStr, cutoff) > 0) return null

    // Parse date for DB query
    const today = new Date(dateStr + 'T00:00:00Z')

    // Check if already marked today
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    })
    if (existing) return null

    // Check if today is a working day (fall back to calendar if no DB record)
    const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })
    const dayOfWeek  = today.getDay()
    const resolvedType = workingDay?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
    if (resolvedType !== DayType.WORKING_DAY) {
      const satEnabled = settings.saturday_attendance_enabled === 'true'
      const sunEnabled = settings.sunday_attendance_enabled === 'true'
      if (dayOfWeek === 6 && satEnabled) return { isWeekendSkip: true } as const
      if (dayOfWeek === 0 && sunEnabled) return { isWeekendSkip: true } as const
      return null
    }

    // attendance_from = earliest time a mark is allowed (global setting)
    const attendanceFrom    = settings.reporting_time
    // officialLoginTime = per-day override if set, else global login_time
    const officialLoginTime = workingDay?.reportingTimeOverride ?? settings.login_time ?? '10:00'
    const graceMins         = parseInt(settings.grace_period_minutes, 10) || 15

    // Before attendance window start → do not mark yet
    if (this.minutesDiff(timeStr, attendanceFrom) < 0) return null

    // Late is measured from the official login time, not the attendance window start
    const diffFromLoginTime = this.minutesDiff(timeStr, officialLoginTime)
    const isLate            = diffFromLoginTime > graceMins
    const lateMinutes       = isLate ? diffFromLoginTime - graceMins : null

    const attendance = await this.prisma.attendance.create({
      data: {
        userId,
        workingDayId: workingDay?.id ?? undefined,
        date:         today,
        loginTime:    new Date(),
        status:       isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        isLate,
        lateMinutes,
        approvalStatus: 'pending',
      },
    })

    return {
      date:        dateStr,
      loginTime:   timeStr,
      isLate,
      lateMinutes,
      status:      attendance.status,
    }
  }

  // ── Weekend voluntary self-checkin ─────────────────────────────────────────
  async selfCheckin(userId: string, userRole: Role) {
    if (userRole === Role.CLIENT) return null

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { attendanceApplicable: true } })
    if (!user?.attendanceApplicable) return null

    const settings = await this.getSettings()
    const tz                   = settings.timezone
    const { dateStr, timeStr } = this.getDateInTimezone(tz)
    const cutoff               = settings.cutoff_time

    if (this.minutesDiff(timeStr, cutoff) > 0) return null

    const today      = new Date(dateStr + 'T00:00:00Z')
    const dayOfWeek  = today.getDay()

    // Respect per-day weekend enable/disable setting
    if (dayOfWeek === 6 && settings.saturday_attendance_enabled !== 'true') return null
    if (dayOfWeek === 0 && settings.sunday_attendance_enabled   !== 'true') return null

    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    })
    if (existing) {
      const lt = existing.loginTime
        ? `${String(existing.loginTime.getUTCHours()).padStart(2,'0')}:${String(existing.loginTime.getUTCMinutes()).padStart(2,'0')}`
        : timeStr
      return {
        date:        dateStr,
        loginTime:   lt,
        isLate:      existing.isLate ?? false,
        lateMinutes: existing.lateMinutes,
        status:      existing.status,
      }
    }

    const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })

    let officialLoginTime: string
    let graceMins: number

    if (dayOfWeek === 6) {
      officialLoginTime = workingDay?.reportingTimeOverride ?? settings.saturday_login_time ?? settings.login_time ?? '10:00'
      graceMins = parseInt(settings.saturday_grace_period_minutes ?? settings.grace_period_minutes, 10) || 15
    } else if (dayOfWeek === 0) {
      officialLoginTime = workingDay?.reportingTimeOverride ?? settings.sunday_login_time ?? settings.login_time ?? '10:00'
      graceMins = parseInt(settings.sunday_grace_period_minutes ?? settings.grace_period_minutes, 10) || 15
    } else {
      officialLoginTime = workingDay?.reportingTimeOverride ?? settings.login_time ?? '10:00'
      graceMins = parseInt(settings.grace_period_minutes, 10) || 15
    }

    const diffFromLoginTime = this.minutesDiff(timeStr, officialLoginTime)
    const isLate            = diffFromLoginTime > graceMins
    const lateMinutes       = isLate ? diffFromLoginTime - graceMins : null

    const attendance = await this.prisma.attendance.create({
      data: {
        userId,
        workingDayId: workingDay?.id ?? undefined,
        date:         today,
        loginTime:    new Date(),
        status:       isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        isLate,
        lateMinutes,
        approvalStatus: 'pending',
      },
    })

    return {
      date:        dateStr,
      loginTime:   timeStr,
      isLate,
      lateMinutes,
      status:      attendance.status,
    }
  }

  // ── My attendance (calendar + summary) ─────────────────────────────────────

  async getMyAttendance(userId: string, month: number, year: number) {
    const startDate = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00Z`)
    const endDate   = new Date(year, month, 1)

    // Get all attendance records for this user/month
    const records = await this.prisma.attendance.findMany({
      where: {
        userId,
        date: { gte: startDate, lt: endDate },
      },
      orderBy: { date: 'asc' },
    })

    // Get working days for this month
    const workingDays = await this.prisma.workingDay.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      orderBy: { date: 'asc' },
    })

    const wdMap = new Map(workingDays.map(d => [d.date.toISOString().split('T')[0], d]))
    const attMap = new Map(records.map(r => [r.date.toISOString().split('T')[0], r]))

    const daysInMonth = new Date(year, month, 0).getDate()
    const today       = new Date().toISOString().split('T')[0]

    // Days before this user even existed aren't "absent", they hadn't joined yet
    const joinedUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
    const joinDateStr = joinedUser?.createdAt
      ? new Date(joinedUser.createdAt).toISOString().split('T')[0]
      : null

    const calendar = []
    const summary  = { present: 0, absent: 0, late: 0, leave: 0, weekend: 0, working_days: 0, not_joined: 0 }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const dayOfWeek = new Date(dateStr).getDay()
      const wd       = wdMap.get(dateStr)
      const att      = attMap.get(dateStr)
      const isUpcoming  = dateStr > today
      const isNotJoined = joinDateStr !== null && dateStr < joinDateStr

      // Resolve day type, fall back to calendar (weekend vs weekday) when there's no WorkingDay override
      const isHoliday = wd?.dayType === DayType.HOLIDAY
      const isWeekend = wd ? wd.dayType === DayType.WEEKEND : (dayOfWeek === 0 || dayOfWeek === 6)

      let status: string
      if (isNotJoined) {
        status = 'not_joined'
      } else if (isHoliday) {
        status = 'leave'
      } else if (isWeekend) {
        status = 'weekend'
      } else if (isUpcoming) {
        status = 'upcoming'
      } else if (!att) {
        // A real attendance record always wins over the day-type fallback, this used to be
        // skipped entirely when there was no WorkingDay row, showing "Absent" even with a login.
        status = 'absent'
      } else if (att.status === AttendanceStatus.LATE) {
        status = 'late'
      } else if (att.status === AttendanceStatus.LEAVE) {
        status = 'leave'
      } else {
        status = 'present'
      }

      if (status === 'present')  summary.present++
      else if (status === 'absent') summary.absent++
      else if (status === 'late') { summary.late++; summary.present++ }
      else if (status === 'leave') summary.leave++
      else if (status === 'weekend') summary.weekend++
      else if (status === 'not_joined') summary.not_joined++

      if (!isNotJoined) {
        const resolvedType = wd?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
        if (resolvedType === DayType.WORKING_DAY) summary.working_days++
      }

      calendar.push({
        date:           dateStr,
        day_name:       DAY_NAMES[dayOfWeek],
        status,
        login_time:     att?.loginTime
          ? new Date(att.loginTime).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false })
          : null,
        is_late:        att?.isLate ?? false,
        late_minutes:   att?.lateMinutes ?? null,
        approval_status: att?.approvalStatus ?? null,
        manually_edited: att?.editedById != null,
      })
    }

    return {
      calendar,
      summary,
      joining_date: joinDateStr,
    }
  }

  // ── Attendance report (all users, manager/partner) ──────────────────────────

  // ── Sidebar badge: how many attendance/leave records are awaiting this actor's approval ──
  async pendingApprovalCount(actorRole: Role, actorId: string) {
    const now = new Date()
    const startDate = new Date(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`)
    const endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const attWhere: any = {
      user:           { attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
      date:           { gte: startDate, lt: endDate },
      approvalStatus: 'pending',
    }
    if (actorRole === Role.TEAM_LEAD) {
      const trainees = await this.prisma.user.findMany({ where: { teamLeadId: actorId }, select: { id: true } })
      attWhere.userId = { in: [actorId, ...trainees.map(t => t.id)] }
    }

    // Leave approvals are Admin/Partner/Manager only. Team Leads don't approve leaves.
    // Mirrors the CAN_APPROVE hierarchy in leaves.service.ts (Manager can't approve other Managers' leaves).
    const leaveApprovableRoles: Record<string, Role[]> = {
      [Role.PARTNER]: [Role.TRAINEE, Role.TEAM_LEAD, Role.MANAGER],
      [Role.ADMIN]:   [Role.TRAINEE, Role.TEAM_LEAD, Role.MANAGER, Role.PARTNER],
      [Role.MANAGER]: [Role.TRAINEE, Role.TEAM_LEAD],
    }
    const approvableRoles = leaveApprovableRoles[actorRole] ?? []

    const [attCount, leaveCount] = await Promise.all([
      this.prisma.attendance.count({ where: attWhere }),
      approvableRoles.length
        ? this.prisma.leaveApplication.count({ where: { status: 'pending', applicant: { role: { in: approvableRoles } } } })
        : Promise.resolve(0),
    ])
    return attCount + leaveCount
  }

  async getReport(month: number | null, year: number | null, actorRole: Role, actorId: string, targetUserId?: string) {
    const where: any = { user: { attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } } }
    if (month && year) {
      const startDate = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00Z`)
      const endDate   = new Date(year, month, 1)
      where.date = { gte: startDate, lt: endDate }
    }

    if (actorRole === Role.TEAM_LEAD) {
      const trainees = await this.prisma.user.findMany({ where: { teamLeadId: actorId }, select: { id: true } })
      const allowedIds = [actorId, ...trainees.map(t => t.id)]
      where.userId = targetUserId && allowedIds.includes(targetUserId) ? targetUserId : { in: allowedIds }
    } else if (targetUserId) {
      where.userId = targetUserId
    }

    const records = await this.prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, role: true, isActive: true, createdAt: true } },
      },
      orderBy: [{ date: 'asc' }, { user: { fullName: 'asc' } }],
    })

    return records.map(r => ({
      id:          r.id,
      userId:      r.userId,
      userName:    r.user.fullName,
      userRole:    r.user.role,
      isActive:    r.user.isActive,
      joinDate:    r.user.createdAt.toISOString().split('T')[0],
      date:        r.date.toISOString().split('T')[0],
      loginTime:   r.loginTime
        ? new Date(r.loginTime).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false })
        : null,
      status:      r.status,
      isLate:      r.isLate,
      lateMinutes: r.lateMinutes,
      approvalStatus: r.approvalStatus,
      notes:       r.notes,
    }))
  }

  // ── Opening balance (historical data before system go-live) ─────────────────

  async getOpeningBalances() {
    return this.prisma.attendanceOpening.findMany({
      select: { userId: true, presents: true, late: true, absents: true, leaves: true, workingDays: true },
    })
  }

  async upsertOpeningBalance(userId: string, dto: { presents: number; late: number; absents: number; leaves: number; workingDays: number }) {
    return this.prisma.attendanceOpening.upsert({
      where:  { userId },
      create: { userId, ...dto },
      update: { ...dto },
    })
  }

  // ── Daily attendance (snapshot of who's in today) ───────────────────────────

  async getDailyAttendance(date: string, actorRole: Role, actorId: string) {
    const day       = new Date(date + 'T00:00:00Z')
    const nextDay   = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    const dayOfWeek = day.getDay()

    const userWhere: any = { role: { in: [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE] }, isActive: true, attendanceApplicable: true }
    if (actorRole === Role.TEAM_LEAD) {
      const trainees = await this.prisma.user.findMany({ where: { teamLeadId: actorId }, select: { id: true } })
      userWhere.id = { in: [actorId, ...trainees.map(t => t.id)] }
    }

    // Get all internal users where attendance is applicable
    const users = await this.prisma.user.findMany({
      where:   userWhere,
      select:  { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    })

    const records = await this.prisma.attendance.findMany({
      where: { date: { gte: day, lt: nextDay } },
    })
    const attMap = new Map(records.map(r => [r.userId, r]))

    const workingDay = await this.prisma.workingDay.findUnique({ where: { date: day } })

    const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6
    const resolvedDayType = workingDay?.dayType ?? (isWeekday ? DayType.WORKING_DAY : DayType.WEEKEND)

    return {
      date,
      dayName:    DAY_NAMES[dayOfWeek],
      isWorkingDay: resolvedDayType === DayType.WORKING_DAY,
      dayType:    resolvedDayType,
      users: users.map(u => {
        const att = attMap.get(u.id)
        return {
          userId:      u.id,
          fullName:    u.fullName,
          role:        u.role,
          status:      att?.status ?? (resolvedDayType === DayType.WORKING_DAY ? 'ABSENT' : 'N/A'),
          loginTime:   att?.loginTime
            ? new Date(att.loginTime).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false })
            : null,
          isLate:      att?.isLate ?? false,
          lateMinutes: att?.lateMinutes ?? null,
        }
      }),
    }
  }

  // ── Edit attendance (manager/partner) ───────────────────────────────────────

  private async assertNotManagerEditingManager(editorId: string, targetUserId: string) {
    const [editor, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: editorId }, select: { role: true } }),
      this.prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } }),
    ])
    if (editor?.role === Role.MANAGER && target?.role === Role.MANAGER) {
      throw new ForbiddenException('Managers cannot edit another manager\'s attendance')
    }
  }

  async createAttendance(userId: string, date: string, dto: UpdateAttendanceDto, editorId: string) {
    // Managers cannot create/edit attendance for other managers
    await this.assertNotManagerEditingManager(editorId, userId)

    const existing = await this.prisma.attendance.findFirst({ where: { userId, date: new Date(date) } })
    if (existing) return this.updateAttendance(existing.id, dto, editorId)

    const data: any = {
      userId,
      date:       new Date(date),
      status:     dto.status ?? 'PRESENT',
      isLate:     dto.isLate ?? false,
      lateMinutes: dto.lateMinutes ?? 0,
      notes:      dto.notes,
      editedById: editorId,
    }
    if (dto.loginTime) {
      const [h, m] = dto.loginTime.split(':').map(Number)
      const d      = new Date(date)
      d.setUTCHours(h - 5, m, 0, 0)
      data.loginTime = d
    }
    return this.prisma.attendance.create({ data })
  }

  async updateAttendance(id: string, dto: UpdateAttendanceDto, editorId: string) {
    const att = await this.prisma.attendance.findUnique({ where: { id } })
    if (!att) throw new NotFoundException('Attendance record not found')

    // Managers cannot edit attendance belonging to another manager
    await this.assertNotManagerEditingManager(editorId, att.userId)

    const data: any = { editedById: editorId }
    if (dto.status !== undefined)      data.status      = dto.status
    if (dto.isLate !== undefined)      data.isLate      = dto.isLate
    if (dto.lateMinutes !== undefined) data.lateMinutes = dto.lateMinutes
    if (dto.notes !== undefined)       data.notes       = dto.notes

    if (dto.loginTime !== undefined) {
      if (dto.loginTime) {
        // Parse HH:MM and rebuild DateTime using attendance date
        const [h, m] = dto.loginTime.split(':').map(Number)
        const d      = new Date(att.date)
        d.setUTCHours(h - 5, m, 0, 0)  // PKT→UTC
        data.loginTime = d

        // A login time was just set manually, if the caller didn't also explicitly
        // override status/lateness, recompute them instead of leaving a stale ABSENT.
        if (dto.status === undefined && dto.isLate === undefined && dto.lateMinutes === undefined) {
          const settings   = await this.getSettings()
          const workingDay = await this.prisma.workingDay.findUnique({ where: { date: att.date } })
          const dayOfWeek  = att.date.getUTCDay()
          const officialLoginTime = workingDay?.reportingTimeOverride
            ?? (dayOfWeek === 6 ? settings.saturday_login_time : dayOfWeek === 0 ? settings.sunday_login_time : undefined)
            ?? settings.login_time ?? '10:00'
          const graceMins = parseInt(
            (dayOfWeek === 6 ? settings.saturday_grace_period_minutes : dayOfWeek === 0 ? settings.sunday_grace_period_minutes : undefined)
            ?? settings.grace_period_minutes, 10) || 15

          const diffFromLoginTime = this.minutesDiff(dto.loginTime, officialLoginTime)
          const isLate            = diffFromLoginTime > graceMins
          data.status      = isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT
          data.isLate      = isLate
          data.lateMinutes = isLate ? diffFromLoginTime - graceMins : null
        }
      } else {
        // Login time cleared, revert to absent unless the caller says otherwise
        data.loginTime = null
        if (dto.status === undefined) data.status = AttendanceStatus.ABSENT
      }
    }

    return this.prisma.attendance.update({ where: { id }, data })
  }

  // ── Approve leave/correction request ───────────────────────────────────────

  // ── One-time backfill: mark past absent days ───────────────────────────────
  async backfillAbsent(): Promise<{ created: number }> {
    const settings = await this.getSettings()
    const tz       = settings.timezone ?? 'Asia/Karachi'

    const { dateStr: todayStr } = this.getDateInTimezone(tz)
    const yesterday = new Date(todayStr + 'T00:00:00Z')
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    const moduleStart = new Date('2026-01-01T00:00:00Z')
    if (yesterday < moduleStart) return { created: 0 }

    // All applicable users with their creation date (attendance only relevant from createdAt onwards)
    const users = await this.prisma.user.findMany({
      where:  { attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
      select: { id: true, createdAt: true },
    })
    if (users.length === 0) return { created: 0 }

    // Per-user start date = max(moduleStart, user.createdAt truncated to UTC day)
    const userStartMap = new Map(users.map(u => {
      const created = new Date(u.createdAt)
      created.setUTCHours(0, 0, 0, 0)
      const start = created > moduleStart ? created : moduleStart
      return [u.id, start]
    }))
    const userIds = users.map(u => u.id)

    // All working-day overrides in range
    const workingDays = await this.prisma.workingDay.findMany({
      where:  { date: { gte: moduleStart, lte: yesterday } },
      select: { date: true, dayType: true, id: true },
    })
    const wdMap = new Map(workingDays.map(w => [w.date.toISOString().split('T')[0], w]))

    // All existing records in range
    const existing = await this.prisma.attendance.findMany({
      where:  { date: { gte: moduleStart, lte: yesterday }, userId: { in: userIds } },
      select: { userId: true, date: true },
    })
    const existingSet = new Set(
      existing.map(r => `${r.userId}|${r.date.toISOString().split('T')[0]}`)
    )

    // Build list of missing (userId, date) pairs
    type Row = { userId: string; date: Date; workingDayId: string | undefined }
    const toCreate: Row[] = []
    const cursor = new Date(moduleStart)

    while (cursor <= yesterday) {
      const dateStr   = cursor.toISOString().split('T')[0]
      const dayOfWeek = cursor.getDay()
      const wd        = wdMap.get(dateStr)
      const resolved  = wd?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)

      // Only mandatory working days get auto-absent, weekends are voluntary
      if (resolved === DayType.WORKING_DAY) {
        const dateObj = new Date(cursor)
        for (const user of users) {
          const userStart = userStartMap.get(user.id)!
          // Skip dates before this user was created
          if (dateObj < userStart) continue
          if (!existingSet.has(`${user.id}|${dateStr}`)) {
            toCreate.push({ userId: user.id, date: dateObj, workingDayId: wd?.id })
          }
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    if (toCreate.length === 0) return { created: 0 }

    // Insert in chunks of 200
    const CHUNK = 200
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await this.prisma.attendance.createMany({
        data: toCreate.slice(i, i + CHUNK).map(r => ({
          userId:         r.userId,
          workingDayId:   r.workingDayId ?? null,
          date:           r.date,
          loginTime:      null,
          status:         AttendanceStatus.ABSENT,
          isLate:         false,
          lateMinutes:    null,
          approvalStatus: 'pending',
        })),
        skipDuplicates: true,
      })
    }

    return { created: toCreate.length }
  }

  async approveAttendance(id: string, approverId: string, approve: boolean) {
    const att = await this.prisma.attendance.findUnique({ where: { id } })
    if (!att) throw new NotFoundException('Attendance record not found')

    return this.prisma.attendance.update({
      where: { id },
      data: {
        approvalStatus: approve ? 'approved' : 'rejected',
        approvedById:   approverId,
        approvedAt:     new Date(),
        // Marking absent on reject, manager is overriding the claimed login
        ...(approve ? {} : { status: AttendanceStatus.ABSENT, isLate: false, lateMinutes: null }),
      },
    })
  }
}
