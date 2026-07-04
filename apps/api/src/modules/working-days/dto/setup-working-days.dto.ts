import { Type } from 'class-transformer'
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'
import { DayType } from '@prisma/client'

export class WorkingDayEntryDto {
  @IsDateString()
  date: string

  @IsEnum(DayType)
  dayType: DayType

  @IsOptional()
  @IsString()
  leaveReason?: string

  @IsOptional()
  @IsString()
  reportingTimeOverride?: string  // HH:MM
}

export class SetupWorkingDaysDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month: number

  @IsInt()
  @Min(2020)
  year: number

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingDayEntryDto)
  days: WorkingDayEntryDto[]
}
