import { IsString, MinLength } from 'class-validator'

export class LoginDto {
  // Accepts either the user's email or their permanent userCode (P001, M001, T001, C-0000001)
  @IsString()
  identifier: string

  @IsString()
  @MinLength(6)
  password: string
}
