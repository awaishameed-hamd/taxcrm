import { IsOptional, IsString, IsNumber, Min } from 'class-validator'

export class AdvanceTaskDto {
  @IsOptional() @IsString() comment?: string
  @IsOptional() @IsString() attachment?: string

  // Step 4, annexure file paths (set by backend after upload)
  @IsOptional() @IsString() annexureA?: string
  @IsOptional() @IsString() annexureC?: string

  // Step 6, challan
  @IsOptional() @IsString() psid?: string
  @IsOptional() @IsNumber() @Min(0) challanAmount?: number

  // Step 8, filing
  @IsOptional() @IsString() feeInvoiceNo?: string
  @IsOptional() @IsNumber() @Min(0) feeInvoiceAmount?: number
}
