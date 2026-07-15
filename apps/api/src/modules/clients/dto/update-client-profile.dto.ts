import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateClientProfileDto {
  @IsOptional() @IsString()               fullName?:     string
  @IsOptional() @IsString()               phone?:        string
  @IsOptional() @IsString() @MinLength(8) password?:     string
  @IsOptional() @IsString()     cnic?:         string
  @IsOptional() @IsDateString() dateOfBirth?:  string
  @IsOptional() @IsString()     address?:      string
  @IsOptional() @IsString()     city?:         string
  @IsOptional() @IsString()     province?:     string
  @IsOptional() @IsString()     ntn?:          string
  @IsOptional() @IsString()     strn?:         string
  @IsOptional() @IsString()     businessName?: string
  @IsOptional() @IsString()     businessType?: string
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Every client must be assigned to a staff member' }) traineeId?: string
  @IsOptional() @IsString()     representativeId?: string
  @IsOptional() @IsArray() @IsString({ each: true }) salesTaxAuthorities?: string[]
  @IsOptional() @IsBoolean()    hasWhtService?: boolean
  @IsOptional() @IsBoolean()    hasAdvanceTaxService?: boolean
  @IsOptional() @IsString()     yearEnd?:      string
  @IsOptional()                 extraFields?:  Record<string, any>
}
