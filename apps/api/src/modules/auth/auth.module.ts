import { Module }        from '@nestjs/common'
import { JwtModule }     from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthService }   from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy }   from './strategies/jwt.strategy'
import { AttendanceModule } from '../attendance/attendance.module'
import { ProfileModule }    from '../profile/profile.module'
import { ClientsModule }    from '../clients/clients.module'
import { EmailModule }      from '../email/email.module'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    AttendanceModule,
    ProfileModule,
    ClientsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers:   [AuthService, JwtStrategy],
  exports:     [AuthService],
})
export class AuthModule {}
