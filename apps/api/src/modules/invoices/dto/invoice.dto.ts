import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'
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
