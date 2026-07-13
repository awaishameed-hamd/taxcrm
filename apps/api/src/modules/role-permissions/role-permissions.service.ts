import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const ALL_ROLES = ['PARTNER', 'MANAGER', 'TEAM_LEAD', 'TRAINEE']

export const FEATURES: Record<string, { label: string; roles: string[] }> = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  dashboard:              { label: 'Dashboard',               roles: ALL_ROLES },

  // ── Clients ────────────────────────────────────────────────────────────────
  clients:                { label: 'View Clients',            roles: ALL_ROLES },
  clients_create:         { label: 'Add New Client',          roles: ALL_ROLES },
  clients_edit:           { label: 'Edit Client',             roles: ALL_ROLES },
  representatives:        { label: 'View Representatives',    roles: ALL_ROLES },
  representatives_create: { label: 'Add Representative',      roles: ALL_ROLES },
  representatives_edit:   { label: 'Edit Representative',     roles: ALL_ROLES },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tasks:                  { label: 'Tasks',                   roles: ALL_ROLES },
  completed_tasks:        { label: 'Completed Tasks',         roles: ALL_ROLES },
  incomplete_tasks:       { label: 'Incomplete Tasks',        roles: ALL_ROLES },
  task_approval:          { label: 'Task Approval',           roles: ALL_ROLES },
  task_delete:            { label: 'Delete Task',             roles: ALL_ROLES },
  task_mark_incomplete:   { label: 'Mark Task as Incomplete', roles: ALL_ROLES },

  // ── Team ───────────────────────────────────────────────────────────────────
  team:                   { label: 'View My Team',            roles: ALL_ROLES },
  team_create:            { label: 'Add Team Member',         roles: ALL_ROLES },
  team_edit:              { label: 'Edit Team Member',        roles: ALL_ROLES },

  // ── Communication ──────────────────────────────────────────────────────────
  messages:               { label: 'Chat / Messages',         roles: ALL_ROLES },

  // ── Attendance ─────────────────────────────────────────────────────────────
  my_attendance:          { label: 'My Attendance',           roles: ALL_ROLES },
  attendance_report:      { label: 'Attendance Report',       roles: ALL_ROLES },
  attendance_approval:    { label: 'Attendance Approval',     roles: ALL_ROLES },
  daily_attendance:       { label: 'Daily Attendance',        roles: ALL_ROLES },
  working_days:           { label: 'Working Days',            roles: ALL_ROLES },

  // ── Tax Summary ────────────────────────────────────────────────────────────
  tax_summary:            { label: 'Tax Summary',             roles: ALL_ROLES },

  // ── Profile ────────────────────────────────────────────────────────────────
  my_profile:             { label: 'My Profile',              roles: ALL_ROLES },
}

const ALL_TRUE = (keys: string[]) => Object.fromEntries(keys.map(k => [k, true]))
const ALL_FEAT = Object.keys(FEATURES)

const DEFAULTS: Record<string, Record<string, boolean>> = {
  PARTNER:   ALL_TRUE(ALL_FEAT),
  MANAGER:   ALL_TRUE(ALL_FEAT),
  TEAM_LEAD: {
    dashboard:              true,
    clients:                true,
    clients_create:         true,
    clients_edit:           true,
    representatives:        true,
    representatives_create: false,
    representatives_edit:   false,
    tasks:                  true,
    completed_tasks:        true,
    incomplete_tasks:       true,
    task_approval:          true,
    task_delete:            false,
    task_mark_incomplete:   false,
    team:                   true,
    team_create:            false,
    team_edit:              false,
    messages:               true,
    my_attendance:          true,
    attendance_report:      true,
    attendance_approval:    true,
    daily_attendance:       true,
    working_days:           true,
    tax_summary:            true,
    my_profile:             true,
  },
  TRAINEE: {
    dashboard:              true,
    clients:                true,
    clients_create:         false,
    clients_edit:           false,
    representatives:        false,
    representatives_create: false,
    representatives_edit:   false,
    tasks:                  true,
    completed_tasks:        true,
    incomplete_tasks:       false,
    task_approval:          false,
    task_delete:            false,
    task_mark_incomplete:   false,
    team:                   false,
    team_create:            false,
    team_edit:              false,
    messages:               true,
    my_attendance:          true,
    attendance_report:      false,
    attendance_approval:    false,
    daily_attendance:       false,
    working_days:           false,
    tax_summary:            true,
    my_profile:             true,
  },
}

@Injectable()
export class RolePermissionsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedMissing()
  }

  private async seedMissing() {
    const rows     = await this.prisma.rolePermission.findMany()
    const existing = new Set(rows.map(r => `${r.role}:${r.feature}`))
    const toCreate: { role: string; feature: string; enabled: boolean }[] = []
    for (const [role, features] of Object.entries(DEFAULTS)) {
      for (const [feature, enabled] of Object.entries(features)) {
        if (!existing.has(`${role}:${feature}`)) toCreate.push({ role, feature, enabled })
      }
    }
    if (toCreate.length) await this.prisma.rolePermission.createMany({ data: toCreate })
  }

  async getAll() {
    await this.seedMissing()
    return this.prisma.rolePermission.findMany({
      orderBy: [{ role: 'asc' }, { feature: 'asc' }],
    })
  }

  async getForRole(role: string): Promise<Record<string, boolean>> {
    const rows   = await this.prisma.rolePermission.findMany({ where: { role } })
    const result: Record<string, boolean> = {}
    if (DEFAULTS[role]) Object.assign(result, DEFAULTS[role])
    for (const row of rows) result[row.feature] = row.enabled
    return result
  }

  async toggle(role: string, feature: string, enabled: boolean) {
    return this.prisma.rolePermission.upsert({
      where:  { role_feature: { role, feature } },
      create: { role, feature, enabled },
      update: { enabled },
    })
  }

  getFeatures() {
    return FEATURES
  }
}
