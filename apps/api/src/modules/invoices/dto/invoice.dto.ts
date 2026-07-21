import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { InvoiceStatus, PaymentMethod, OverpaymentType } from '@prisma/client'

export class CreateInvoiceDto {
  @IsString() @IsNotEmpty() clientId: string
  @IsOptional() @IsNumber() @Min(0) subtotal?: number
  @IsOptional() @IsNumber() @Min(0) salesTax?: number
  @IsOptional() @IsNumber() @Min(0) outOfPocket?: number
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateInvoiceDto {
  @IsOptional() @IsNumber() @Min(0) subtotal?: number
  @IsOptional() @IsNumber() @Min(0) salesTax?: number
  @IsOptional() @IsNumber() @Min(0) outOfPocket?: number
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsString() notes?: string
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus
}

export class UpdatePaymentDto {
  @IsOptional() @IsNumber() @Min(0.01) amount?: number
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() proofUrl?: string
  @IsOptional() @IsString() paidAt?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateOpeningBalanceDto {
  @IsNumber() openingBalance: number
}

// One slice of a received payment, applied against a single open invoice.
// `amount` is cash; the rest settle the invoice without money changing hands.
export class PaymentAllocationDto {
  @IsString() @IsNotEmpty() invoiceId: string
  @IsNumber() @Min(0) amount: number
  @IsOptional() @IsNumber() @Min(0) discount?: number
  @IsOptional() @IsNumber() @Min(0) incomeTaxWithheld?: number
  @IsOptional() @IsNumber() @Min(0) salesTaxWithheld?: number
}

// QuickBooks-style "Receive Payment": one payment from a client, spread across
// however many of their open invoices it settles. `amount` is what actually came in ,
// leaving it above the allocations (or sending none at all) records an advance, and
// the leftover stays as unapplied credit.
export class ReceivePaymentDto {
  @IsString() @IsNotEmpty() clientId: string
  @IsNumber() @Min(0.01) amount: number
  @IsEnum(PaymentMethod) method: PaymentMethod
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() proofUrl?: string
  @IsOptional() @IsString() paidAt?: string
  @IsOptional() @IsString() notes?: string
  // What happens to anything received beyond what was applied
  @IsOptional() @IsEnum(OverpaymentType) overpaymentType?: OverpaymentType
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[]
}

// Put an existing payment's unapplied credit against invoices raised since.
export class ApplyPaymentDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto)
  allocations: PaymentAllocationDto[]
}
