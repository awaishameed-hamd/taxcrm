import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateLoginDetailDto {
  @IsOptional() @IsString() authority?: string
  @IsOptional() @IsString() loginId?: string
  @IsOptional() @IsString() password?: string
}

export class CreateClientWithLoginDto {
  @IsString() @IsNotEmpty() businessName: string
  @IsString() @IsNotEmpty({ message: 'Every client must be assigned to a staff member' }) traineeId: string
  @IsString() @IsNotEmpty() authority: string
  @IsOptional() @IsString() loginId?: string
  @IsOptional() @IsString() password?: string
}
