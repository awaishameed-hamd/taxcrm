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

  /**
   * Permanently deletes a representative — for records created by mistake.
   *
   * Refuses while any client still points at them. It used to quietly unlink
   * those clients first, which meant deleting a representative silently stripped
   * the contact off every client they handled.
   */
  async remove(id: string) {
    const rep = await this.prisma.clientRepresentative.findUnique({
      where:  { id },
      select: {
        id: true, fullName: true, userId: true,
        clients: {
          select: { businessName: true, user: { select: { fullName: true, userCode: true } } },
          take: 5,
        },
        _count: { select: { clients: true } },
      },
    })
    if (!rep) throw new NotFoundException('Representative not found')

    if (rep._count.clients > 0) {
      const names = rep.clients
        .map(c => c.businessName ?? c.user?.fullName ?? c.user?.userCode)
        .filter(Boolean)
      const extra = rep._count.clients - names.length
      const list  = names.join(', ') + (extra > 0 ? ` and ${extra} more` : '')
      throw new BadRequestException(
        `${rep.fullName} is still assigned to ${rep._count.clients} client${rep._count.clients === 1 ? '' : 's'} (${list}). ` +
        `Reassign or clear the representative on those clients first.`,
      )
    }

    await this.prisma.$transaction(async tx => {
      if (rep.userId) {
        // Chat messages have no cascade rule and would block the delete.
        await tx.message.deleteMany({ where: { senderId: rep.userId } })
        await tx.conversationParticipant.deleteMany({ where: { userId: rep.userId } })
      }
      await tx.clientRepresentative.delete({ where: { id } })
      // The portal login is only ever created for this representative, so it goes too.
      if (rep.userId) await tx.user.delete({ where: { id: rep.userId } })
    })

    return { message: 'Representative deleted permanently.' }
  }
}
