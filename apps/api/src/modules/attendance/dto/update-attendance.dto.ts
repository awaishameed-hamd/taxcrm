import { IsEnum, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator'
import { AttendanceStatus } from '@prisma/client'

export class UpdateAttendanceDto {
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus

  @IsOptional()
  @IsString()
  loginTime?: string  // HH:MM override

  @IsOptional()
  @IsBoolean()
  isLate?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  lateMinutes?: number

  @IsOptional()
  @IsString()
  notes?: string
}
