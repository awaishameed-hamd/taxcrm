export enum Role {
  ADMIN     = 'ADMIN',
  PARTNER   = 'PARTNER',
  MANAGER   = 'MANAGER',
  TEAM_LEAD = 'TEAM_LEAD',
  TRAINEE   = 'TRAINEE',
  CLIENT         = 'CLIENT',
  REPRESENTATIVE = 'REPRESENTATIVE',
}

export enum MessageType {
  TEXT  = 'TEXT',
  FILE  = 'FILE',
  IMAGE = 'IMAGE',
}

export enum NotificationType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  NEW_MESSAGE   = 'NEW_MESSAGE',
  SYSTEM        = 'SYSTEM',
}

export enum AttendanceStatus {
  PRESENT  = 'PRESENT',
  ABSENT   = 'ABSENT',
  LATE     = 'LATE',
  LEAVE    = 'LEAVE',
  HOLIDAY  = 'HOLIDAY',
}

export enum DayType {
  WORKING_DAY = 'WORKING_DAY',
  WEEKEND     = 'WEEKEND',
  HOLIDAY     = 'HOLIDAY',
}
