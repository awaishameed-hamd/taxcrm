import { Module } from '@nestjs/common'
import { WorkingDaysController } from './working-days.controller'
import { WorkingDaysService }    from './working-days.service'
import { AttendanceModule }      from '../attendance/attendance.module'

@Module({
  imports:     [AttendanceModule],
  controllers: [WorkingDaysController],
  providers:   [WorkingDaysService],
})
export class WorkingDaysModule {}
