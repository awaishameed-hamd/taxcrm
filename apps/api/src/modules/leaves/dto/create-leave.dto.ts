import { IsString, IsNotEmpty, IsIn } from 'class-validator'

export class CreateLeaveDto {
  @IsString() @IsNotEmpty()
  @IsIn(['sick', 'casual', 'annual', 'exam', 'other'])
  leaveType: string

  @IsString() @IsNotEmpty()
  fromDate: string   // YYYY-MM-DD

  @IsString() @IsNotEmpty()
  toDate: string     // YYYY-MM-DD

  @IsString() @IsNotEmpty()
  reason: string
}
