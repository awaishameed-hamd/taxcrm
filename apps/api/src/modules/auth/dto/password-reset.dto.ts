import { IsString, Length, MinLength } from 'class-validator'

export class ForgotPasswordDto {
  // Same as login: either the email or the permanent userCode.
  @IsString()
  identifier: string
}

export class VerifyResetOtpDto {
  @IsString()
  identifier: string

  @IsString()
  @Length(6, 6, { message: 'The code is 6 digits' })
  otp: string
}

export class ResetPasswordDto {
  @IsString()
  resetToken: string

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string
}
