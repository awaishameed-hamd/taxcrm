import { IsOptional, IsString, MinLength } from 'class-validator'

export class ManagerApproveDto {
  @IsOptional() @IsString() comment?: string
}

export class ManagerSendBackDto {
  @IsString() @MinLength(5) comment: string
}
