import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { Role } from '@ca-firm/shared'

export class CreateUserDto {
  @IsString()
  fullName: string

  @IsEmail()
  email: string

  @IsOptional() @IsString()
  phone?: string

  @IsString()
  @MinLength(8)
  password: string

  @IsEnum(Role)
  role: Role

  // Optional profile fields that can be set at creation time
  @IsOptional() @IsString() teamLeadId?:         string | null
  @IsOptional() @IsString() firstName?:           string
  @IsOptional() @IsString() midName?:             string
  @IsOptional() @IsString() lastName?:            string
  @IsOptional() @IsString() dateOfBirth?:         string
  @IsOptional() @IsString() dateOfJoining?:       string
  @IsOptional() @IsString() department?:          string
  @IsOptional() @IsString() experience?:          string
  @IsOptional() @IsString() cnic?:                string
  @IsOptional() @IsString() permanentAddress?:    string
  @IsOptional() @IsString() currentAddress?:      string
  @IsOptional() @IsString() bank?:                string
  @IsOptional() @IsString() accountTitle?:        string
  @IsOptional() @IsString() bankAccountNo?:       string
  @IsOptional() @IsString() ibanNo?:              string
  @IsOptional() @IsString() basicSalary?:         string
  @IsOptional() @IsString() punctualityAllowance?:string
  @IsOptional() @IsString() travellingAllowance?: string
  @IsOptional() @IsString() otherAllowance?:      string
  @IsOptional()             extraFields?:          Record<string, any>
}
