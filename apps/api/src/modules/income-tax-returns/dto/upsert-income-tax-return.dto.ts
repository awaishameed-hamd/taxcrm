import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class UpsertIncomeTaxReturnDto {
  @IsString()  clientId: string
  @IsOptional() @IsString() taskId?: string

  @IsInt() @Min(2000) @Type(() => Number) periodYear: number

  @IsOptional() @Type(() => Number) totalProfitLoss?:       number
  @IsOptional() @Type(() => Number) profitLossExempt?:      number
  @IsOptional() @Type(() => Number) amountSubjectNormal?:   number
  @IsOptional() @Type(() => Number) normalIncomeTax?:       number
  @IsOptional() @Type(() => Number) turnoverTax?:           number
  @IsOptional() @Type(() => Number) taxOnAccountingProfit?: number
  @IsOptional() @Type(() => Number) differenceMinimumTax?:  number
  @IsOptional() @Type(() => Number) superTax?:              number
  @IsOptional() @Type(() => Number) taxChargeable?:         number
  @IsOptional() @Type(() => Number) admittedIncomeTax?:     number
  @IsOptional() @Type(() => Number) refundableIncomeTax?:   number
}
