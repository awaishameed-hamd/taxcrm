import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { Role } from '@ca-firm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'

export interface CreateRepDto {
  fullName: string
  email: string
  phone?: string
  hasPortalAccess?: boolean
}

export interface UpdateRepDto {
  fullName?: string
  email?: string
  phone?: string
}

@Injectable()
export class ClientRepresentativesService {
  constructor(
    private prisma:  PrismaService,
    private email:   EmailService,
    private config:  ConfigService,
  ) {}

  async findAll() {
    return this.prisma.clientRepresentative.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { clients: true } },
        clients: {
          select: {
            id: true,
            businessName: true,
            user: { select: { fullName: true, userCode: true } },
          },
        },
      },
    })
  }

  async findOne(id: string) {
    const rep = await this.prisma.clientRepresentative.findUnique({
      where: { id },
      include: { clients: { include: { user: { select: { fullName: true, email: true } } } } },
    })
    if (!rep) throw new NotFoundException('Representative not found')
    return rep
  }

  async create(dto: CreateRepDto) {
    const existing = await this.prisma.clientRepresentative.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('Email already in use')
    return this.prisma.clientRepresentative.create({ data: dto })
  }

  async update(id: string, dto: UpdateRepDto) {
    await this.findOne(id)
    return this.prisma.clientRepresentative.update({ where: { id }, data: dto })
  }

  async toggleActive(id: string) {
    const rep = await this.prisma.clientRepresentative.findUnique({ where: { id }, select: { isActive: true } })
    if (!rep) throw new NotFoundException('Representative not found')
    return this.prisma.clientRepresentative.update({ where: { id }, data: { isActive: !rep.isActive }, select: { isActive: true } })
  }

  async togglePortal(id: string, password?: string) {
    const rep = await this.prisma.clientRepresentative.findUnique({
      where: { id },
      select: { hasPortalAccess: true, userId: true, email: true, fullName: true },
    })
    if (!rep) throw new NotFoundException('Representative not found')

    const enabling = !rep.hasPortalAccess

    if (enabling) {
      const tempPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
      const hashedPassword = password && password.length >= 6
        ? await bcrypt.hash(password, 12)
        : tempPassword

      let userId = rep.userId

      if (!userId) {
        const existing = await this.prisma.user.findUnique({ where: { email: rep.email } })
        if (existing) throw new ConflictException('A user with this email already exists')

        const user = await this.prisma.user.create({
          data: {
            userCode:        `REP-${id.slice(-6).toUpperCase()}`,
            fullName:        rep.fullName,
            email:           rep.email,
            password:        hashedPassword,
            role:            Role.REPRESENTATIVE as any,
            hasPortalAccess: true,
            isActive:        true,
          },
          select: { id: true },
        })
        userId = user.id

        await this.prisma.clientRepresentative.update({
          where: { id },
          data:  { hasPortalAccess: true, userId },
        })
      } else {
        await this.prisma.user.update({
          where: { id: userId },
          data:  { password: hashedPassword, hasPortalAccess: true, isActive: true },
        })
        await this.prisma.clientRepresentative.update({ where: { id }, data: { hasPortalAccess: true } })
      }

      // If no password provided, send a set-password invite email
      if (!password || password.length < 6) {
        const token   = randomBytes(32).toString('hex')
        const expires = new Date(Date.now() + 48 * 60 * 60 * 1000)
        await this.prisma.user.update({ where: { id: userId }, data: { inviteToken: token, inviteTokenExp: expires } })
        const clientUrl = this.config.get<string>('clientUrl') ?? 'http://localhost:3000'
        await this.email.sendPortalInvite(rep.email, rep.fullName, `${clientUrl}/set-password?token=${token}`)
        return { hasPortalAccess: true, userId, inviteSent: true }
      }

      return { hasPortalAccess: true, userId, inviteSent: false }
    }

    // Disabling portal
    if (rep.userId) {
      await this.prisma.user.update({ where: { id: rep.userId }, data: { hasPortalAccess: false, isActive: false } })
    }
    return this.prisma.clientRepresentative.update({
      where: { id },
      data:  { hasPortalAccess: false },
      select: { hasPortalAccess: true, userId: true },
    })
  }

  async sendInvite(id: string) {
    const rep = await this.prisma.clientRepresentative.findUnique({
      where: { id },
      select: { hasPortalAccess: true, userId: true, email: true, fullName: true },
    })
    if (!rep) throw new NotFoundException('Representative not found')
    if (!rep.hasPortalAccess || !rep.userId) throw new BadRequestException('Enable portal access first')

    const token   = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await this.prisma.user.update({ where: { id: rep.userId }, data: { inviteToken: token, inviteTokenExp: expires } })
    const clientUrl = this.config.get<string>('clientUrl') ?? 'http://localhost:3000'
    await this.email.sendPortalInvite(rep.email, rep.fullName, `${clientUrl}/set-password?token=${token}`)
    return { message: 'Invite sent successfully.' }
  }

  async remove(id: string) {
    await this.findOne(id)
    // Unlink from clients before deleting
    await this.prisma.clientProfile.updateMany({
      where: { representativeId: id },
      data: { representativeId: null },
    })
    return this.prisma.clientRepresentative.delete({ where: { id } })
  }
}
