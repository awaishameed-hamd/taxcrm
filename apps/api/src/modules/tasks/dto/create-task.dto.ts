import { IsString, IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator'
import { Transform } from 'class-transformer'

export enum TaskPriority { LOW = 'LOW', MEDIUM = 'MEDIUM', HIGH = 'HIGH' }
export enum TaskStatus   { TODO = 'TODO', IN_PROGRESS = 'IN_PROGRESS', DONE = 'DONE' }

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsString()
  taxType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  clientId?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  assignedToId?: string

  @IsOptional()
  @IsString()
  authority?: string
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  assignedToId?: string

  @IsOptional()
  @IsString()
  taxType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  clientId?: string
}
