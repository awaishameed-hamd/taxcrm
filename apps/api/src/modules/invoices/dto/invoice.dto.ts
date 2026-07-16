import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { InvoiceStatus, PaymentMethod } from '@prisma/client'

export class CreateInvoiceDto {
  @IsString() @IsNotEmpty() clientId: string
  @IsOptional() @IsNumber() @Min(0) amount?: number
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateInvoiceDto {
  @IsOptional() @IsNumber() @Min(0) amount?: number
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsString() notes?: string
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus
}

export class RecordPaymentDto {
  @IsNumber() @Min(0.01) amount: number
  @IsEnum(PaymentMethod) method: PaymentMethod
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() proofUrl?: string
  @IsOptional() @IsString() paidAt?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateOpeningBalanceDto {
  @IsNumber() openingBalance: number
}

// One slice of a received payment, applied against a single open invoice
export class PaymentAllocationDto {
  @IsString() @IsNotEmpty() invoiceId: string
  @IsNumber() @Min(0) amount: number
}

// QuickBooks-style "Receive Payment": one payment from a client, spread across
// however many of their open invoices it settles.
export class ReceivePaymentDto {
  @IsString() @IsNotEmpty() clientId: string
  @IsEnum(PaymentMethod) method: PaymentMethod
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() proofUrl?: string
  @IsOptional() @IsString() paidAt?: string
  @IsOptional() @IsString() notes?: string
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto)
  allocations: PaymentAllocationDto[]
}
