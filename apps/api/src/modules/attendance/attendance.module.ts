import { Module } from '@nestjs/common'
import { AttendanceController }        from './attendance.controller'
import { AttendanceService }           from './attendance.service'
import { AttendanceSchedulerService }  from './attendance-scheduler.service'

@Module({
  controllers: [AttendanceController],
  providers:   [AttendanceService, AttendanceSchedulerService],
  exports:     [AttendanceService],
})
export class AttendanceModule {}
