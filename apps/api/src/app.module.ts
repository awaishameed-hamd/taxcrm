import { Module } from '@nestjs/common'
import { ConfigModule }   from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import configuration from './config/configuration'
import { PrismaModule }        from './modules/prisma/prisma.module'
import { AuthModule }          from './modules/auth/auth.module'
import { UsersModule }         from './modules/users/users.module'
import { ClientsModule }       from './modules/clients/clients.module'
import { ClientLoginDetailsModule } from './modules/client-login-details/client-login-details.module'
import { ChatModule }          from './modules/chat/chat.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { DashboardModule }     from './modules/dashboard/dashboard.module'
import { AttendanceModule }    from './modules/attendance/attendance.module'
import { WorkingDaysModule }   from './modules/working-days/working-days.module'
import { ProfileModule }       from './modules/profile/profile.module'
import { FormFieldsModule }      from './modules/form-fields/form-fields.module'
import { SalesTaxTasksModule }   from './modules/sales-tax-tasks/sales-tax-tasks.module'
import { TasksModule }           from './modules/tasks/tasks.module'
import { PipelineStepsModule }   from './modules/pipeline-steps/pipeline-steps.module'
import { RolePermissionsModule } from './modules/role-permissions/role-permissions.module'
import { SalesTaxReturnsModule }  from './modules/sales-tax-returns/sales-tax-returns.module'
import { IncomeTaxReturnsModule } from './modules/income-tax-returns/income-tax-returns.module'
import { FilesModule }            from './modules/files/files.module'
import { FbrModule }             from './modules/fbr/fbr.module'
import { LeavesModule }          from './modules/leaves/leaves.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ClientLoginDetailsModule,
    ChatModule,
    NotificationsModule,
    DashboardModule,
    AttendanceModule,
    WorkingDaysModule,
    ProfileModule,
    FormFieldsModule,
    SalesTaxTasksModule,
    TasksModule,
    PipelineStepsModule,
    RolePermissionsModule,
    SalesTaxReturnsModule,
    IncomeTaxReturnsModule,
    FilesModule,
    FbrModule,
    LeavesModule,
  ],
})
export class AppModule {}
