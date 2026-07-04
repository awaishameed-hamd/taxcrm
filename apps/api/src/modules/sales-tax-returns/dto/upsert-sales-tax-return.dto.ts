import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class UpsertSalesTaxReturnDto {
  @IsString()  clientId:    string
  @IsOptional() @IsString()  taskId?: string

  @IsInt() @Min(1) @Type(() => Number) periodMonth: number
  @IsInt() @Min(2000) @Type(() => Number) periodYear: number

  @IsOptional() @IsString() authority?:   string
  @IsOptional() @IsString() returnType?:  string

  // Sales
  @IsOptional() @Type(() => Number) standardSales?:        number
  @IsOptional() @Type(() => Number) outputTaxStandard?:    number
  @IsOptional() @Type(() => Number) reducedRateSales?:     number
  @IsOptional() @Type(() => Number) outputTaxReduced?:     number
  @IsOptional() @Type(() => Number) exemptSales?:          number
  @IsOptional() @Type(() => Number) zeroRatedSales?:       number

  // Purchases
  @IsOptional() @Type(() => Number) standardPurchases?:     number
  @IsOptional() @Type(() => Number) inputTaxStandard?:      number
  @IsOptional() @Type(() => Number) reducedRatePurchases?:  number
  @IsOptional() @Type(() => Number) inputTaxReduced?:       number
  @IsOptional() @Type(() => Number) unregisteredPurchases?: number
  @IsOptional() @Type(() => Number) exemptPurchases?:       number
  @IsOptional() @Type(() => Number) zeroRatedPurchases?:    number

  // Tax
  @IsOptional() @Type(() => Number) normalTaxPayable?:  number
  @IsOptional() @Type(() => Number) furtherTaxPayable?: number
  @IsOptional() @Type(() => Number) taxCarryForward?:   number
}
