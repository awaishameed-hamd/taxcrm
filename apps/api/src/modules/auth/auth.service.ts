import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService }    from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt       from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { PrismaService }     from '../prisma/prisma.service'
import { AttendanceService } from '../attendance/attendance.service'
import { ProfileService }    from '../profile/profile.service'
import { EmailService }      from '../email/email.service'
import { LoginDto }          from './dto/login.dto'

// Long enough to find the mail, short enough that a stolen code goes stale fast.
const OTP_TTL_MIN   = 10
// The window to actually type a new password once the code has been accepted.
const RESET_TTL_MIN = 15
const MAX_OTP_TRIES = 5

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name)

  constructor(
    private prisma:     PrismaService,
    private jwt:        JwtService,
    private config:     ConfigService,
    private attendance: AttendanceService,
    private profile:    ProfileService,
    private email:      EmailService,
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
    // shows until a real socket disconnect updates it to the true offline time ,
    // without it, a user who's never had a clean socket disconnect (e.g. server
    // restarted mid-session) would show no "last seen" at all.
    this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {})

    // Auto-mark attendance (non-blocking, failure should not break login)
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

    // Rotate, delete old, issue new
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

  // ── Password reset by emailed OTP ────────────────────────────────────────────

  /**
   * Step 1. Always answers the same way whether or not the account exists, so
   * this endpoint cannot be used to discover who has an account here.
   */
  async forgotPassword(identifier: string) {
    const generic = { message: 'If that account exists, a reset code has been sent to its email address.' }

    const user = await this.findByIdentifier(identifier)
    // Inactive accounts are a deliberate lockout, so do not let a reset undo it.
    if (!user || !user.isActive) return generic
    // Placeholder addresses are generated for clients created without an email.
    if (user.email.endsWith('@client.internal')) return generic

    const otp = String(Math.floor(100000 + Math.random() * 900000))
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpHash:  await bcrypt.hash(otp, 10),
        resetOtpExp:   new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
        resetOtpTries: 0,
        // A fresh request invalidates any ticket already issued.
        resetToken:    null,
        resetTokenExp: null,
      },
    })

    try {
      await this.email.sendPasswordResetOtp(user.email, user.fullName, otp, OTP_TTL_MIN)
    } catch {
      // Surfacing a send failure here would leak that the account exists.
      this.logger.error(`Failed to send reset OTP to user ${user.userCode}`)
    }
    return generic
  }

  /**
   * Step 2. Trades a correct OTP for a single-use ticket, so the new password is
   * submitted separately and the code never travels with it.
   */
  async verifyResetOtp(identifier: string, otp: string) {
    const invalid = new BadRequestException('That code is not valid. Please check it and try again.')

    const user = await this.findByIdentifier(identifier)
    if (!user || !user.resetOtpHash || !user.resetOtpExp) throw invalid
    if (user.resetOtpExp < new Date()) {
      throw new BadRequestException('That code has expired. Please request a new one.')
    }
    if (user.resetOtpTries >= MAX_OTP_TRIES) {
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.')
    }

    const ok = await bcrypt.compare(otp, user.resetOtpHash)
    if (!ok) {
      await this.prisma.user.update({
        where: { id: user.id },
        data:  { resetOtpTries: { increment: 1 } },
      })
      throw invalid
    }

    const resetToken = uuidv4() + uuidv4()
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExp: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
        // Burn the code the moment it works.
        resetOtpHash:  null,
        resetOtpExp:   null,
        resetOtpTries: 0,
      },
    })
    return { resetToken }
  }

  /** Step 3. Sets the new password and signs every existing session out. */
  async resetPassword(resetToken: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { resetToken } })
    if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
      throw new BadRequestException('This reset link has expired. Please start again.')
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password:      await bcrypt.hash(password, 12),
          resetToken:    null,
          resetTokenExp: null,
          resetOtpHash:  null,
          resetOtpExp:   null,
          resetOtpTries: 0,
        },
      }),
      // Anyone already signed in with the old password is pushed out, which is
      // the point if the account was being misused.
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ])

    return { message: 'Password updated. You can now sign in with your new password.' }
  }

  /** Login accepts an email or a userCode, so reset has to accept both too. */
  private findByIdentifier(identifier: string) {
    const id = identifier.trim()
    if (!id) return Promise.resolve(null)
    return id.includes('@')
      ? this.prisma.user.findUnique({ where: { email: id.toLowerCase() } })
      : this.prisma.user.findUnique({ where: { userCode: id.toUpperCase() } })
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
