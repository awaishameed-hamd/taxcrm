import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'

export interface JwtPayload {
  sub:   string   // user id
  email: string
  role:  string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private config:  ConfigService,
    private prisma:  PrismaService,
  ) {
    super({
      // Normally the token comes in the Authorization header. An <img>, <audio>
      // or <a download> tag cannot set headers, so file links carry it as ?t=
      // instead. That is only useful for GET /files/open, which redirects to a
      // short-lived Backblaze link.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('t'),
      ]),
      ignoreExpiration: false,
      secretOrKey:      config.get<string>('jwt.accessSecret')!,
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where:  { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true, fullName: true },
    })

    if (!user || !user.isActive) throw new UnauthorizedException()
    return user
  }
}
