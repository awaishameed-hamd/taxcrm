import { IsString, IsInt, Min, Max, IsOptional, IsDateString, IsEnum } from 'class-validator'

enum TaskPriorityDto { LOW = 'LOW', MEDIUM = 'MEDIUM', HIGH = 'HIGH', URGENT = 'URGENT' }
export enum TaxAuthorityDto { FBR = 'FBR', PRA = 'PRA', SRB = 'SRB', KPRA = 'KPRA', BRA = 'BRA', AJK = 'AJK' }
export enum ReturnTypeDto { ORIGINAL = 'ORIGINAL', REVISED = 'REVISED' }
export enum TaskTypeDto { SALES_TAX = 'SALES_TAX', INCOME_TAX = 'INCOME_TAX', WHT = 'WHT' }

export class CreateSalesTaxTaskDto {
  @IsString() clientId: string
  @IsString() traineeId: string
  @IsInt() @Min(0) @Max(12) periodMonth: number   // 0 = yearly (Income Tax), 1-4 = quarter (WHT), 1-12 = month (Sales Tax)
  @IsInt() @Min(2020) periodYear: number
  @IsOptional() @IsDateString() dueDate?: string
  @IsOptional() @IsEnum(TaskPriorityDto) priority?: TaskPriorityDto
  @IsOptional() @IsString() assignerNote?: string
  @IsOptional() @IsEnum(TaxAuthorityDto) authority?: TaxAuthorityDto
  @IsOptional() @IsEnum(ReturnTypeDto) returnType?: ReturnTypeDto
  @IsOptional() @IsEnum(TaskTypeDto) taskType?: TaskTypeDto
}
