import { IsDateString, IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(255) fullName?: string
  @IsOptional() @IsString() @MaxLength(100) firstName?: string
  @IsOptional() @IsString() @MaxLength(100) midName?: string
  @IsOptional() @IsString() @MaxLength(100) lastName?: string

  @IsOptional() @IsEmail()                  email?: string
  @IsOptional() @IsString() @MaxLength(30)  phone?: string

  @IsOptional() @IsDateString()             dateOfBirth?: string
  @IsOptional() @IsDateString()             dateOfJoining?: string

  @IsOptional() @IsString() @MaxLength(255) department?: string
  @IsOptional() @IsString() @MaxLength(255) experience?: string

  @IsOptional() @IsString() @MaxLength(15)  cnic?: string
  @IsOptional() @IsString()                 permanentAddress?: string
  @IsOptional() @IsString()                 currentAddress?: string

  @IsOptional() @IsString() @MaxLength(255) bank?: string
  @IsOptional() @IsString() @MaxLength(255) accountTitle?: string
  @IsOptional() @IsString() @MaxLength(100) bankAccountNo?: string
  @IsOptional() @IsString() @MaxLength(100) ibanNo?: string

  @IsOptional() @IsObject()                 extraFields?: Record<string, unknown>
}
