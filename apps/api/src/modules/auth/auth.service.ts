import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService }    from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt       from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { PrismaService }     from '../prisma/prisma.service'
import { AttendanceService } from '../attendance/attendance.service'
import { ProfileService }    from '../profile/profile.service'
import { LoginDto }          from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma:     PrismaService,
    private jwt:        JwtService,
    private config:     ConfigService,
    private attendance: AttendanceService,
    private profile:    ProfileService,
  ) {}

  async login(dto: LoginDto) {
    const isEmail = dto.identifier.includes('@')
    const user = await this.prisma.user.findUnique({
      where: isEmail
        ? { email: dto.identifier.trim().toLowerCase() }
        : { userCode: dto.identifier.trim().toUpperCase() },
    })
    if (!user)            throw new UnauthorizedException('Invalid credentials')
    if (!user.isActive)   throw new UnauthorizedException('Account is inactive')

    const passwordMatch = await bcrypt.compare(dto.password, user.password)
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials')

    const tokens = await this.generateTokens(user.id, user.email, user.role)
    await this.saveRefreshToken(user.id, tokens.refreshToken)

    // Stamp a baseline "last seen" at login. This is the fallback the chat UI
    // shows until a real socket disconnect updates it to the true offline time —
    // without it, a user who's never had a clean socket disconnect (e.g. server
    // restarted mid-session) would show no "last seen" at all.
    this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {})

    // Auto-mark attendance (non-blocking — failure should not break login)
    let attendanceInfo = null
    try {
      attendanceInfo = await this.attendance.autoMarkOnLogin(user.id, user.role)
    } catch { /* ignore attendance errors */ }

    const isWeekendSkip = !!(attendanceInfo && 'isWeekendSkip' in attendanceInfo)
    return {
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id:       user.id,
        userCode: user.userCode,
        email:    user.email,
        fullName: user.fullName,
        role:     user.role,
        avatar:   user.avatar,
      },
      attendance:    isWeekendSkip ? null : attendanceInfo,
      weekendPrompt: isWeekendSkip,
    }
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where:   { token: refreshToken },
      include: { user: true },
    })

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is inactive')
    }

    // Rotate — delete old, issue new
    await this.prisma.refreshToken.delete({ where: { id: stored.id } })
    const tokens = await this.generateTokens(stored.user.id, stored.user.email, stored.user.role)
    await this.saveRefreshToken(stored.user.id, tokens.refreshToken)

    return tokens
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    return { message: 'Logged out successfully' }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      include: {
        clientProfile: { select: { id: true, ntn: true, businessName: true, traineeId: true } },
      },
    })
    if (!user) throw new UnauthorizedException()
    return { ...this.profile.profileData(user), clientProfile: user.clientProfile }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret:    this.config.get('jwt.accessSecret'),
        expiresIn: this.config.get('jwt.accessExpiresIn'),
      }),
      uuidv4(),
    ])

    return { accessToken, refreshToken }
  }

  private async saveRefreshToken(userId: string, token: string) {
    const days = parseInt(
      (this.config.get<string>('jwt.refreshExpiresIn') ?? '7d').replace('d', ''),
      10,
    )
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt } })
  }
}
