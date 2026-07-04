import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { Role } from '@ca-firm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateClientProfileDto } from './dto/update-client-profile.dto'
import { CreateClientDto } from './dto/create-client.dto'
import { generateUserCode } from '../../common/utils/user-code.util'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ClientsService {
  constructor(
    private prisma:  PrismaService,
    private email:   EmailService,
    private config:  ConfigService,
  ) {}

  async create(dto: CreateClientDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('A user with this email already exists')

    const rawPassword = dto.password ?? randomBytes(24).toString('hex')
    const hashed      = await bcrypt.hash(rawPassword, 12)
    const userCode    = await generateUserCode(this.prisma, Role.CLIENT)

    return this.prisma.user.create({
      data: {
        userCode,
        fullName:        dto.fullName,
        email:           dto.email,
        phone:           dto.phone,
        password:        hashed,
        role:            Role.CLIENT,
        hasPortalAccess: dto.hasPortalAccess ?? false,
        clientProfile: {
          create: {
            cnic:                dto.cnic,
            dateOfBirth:         dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
            address:             dto.address,
            ntn:                 dto.ntn,
            strn:                dto.strn,
            businessName:        dto.businessName,
            businessType:        dto.businessType,
            city:                dto.city,
            province:            dto.province,
            traineeId:           dto.traineeId,
            representativeId:    (dto as any).representativeId ?? undefined,
            salesTaxAuthorities: dto.salesTaxAuthorities ?? [],
            hasWhtService:       dto.hasWhtService ?? false,
            ...(dto.extraFields ? { extraFields: dto.extraFields as any } : {}),
          },
        },
      },
      select: {
        id: true, userCode: true, fullName: true, email: true,
        clientProfile: { select: { id: true } },
      },
    })
  }

  async findAll(actorId: string, actorRole: Role, search?: string) {
    const whereTrainee = actorRole === Role.TRAINEE ? { traineeId: actorId } : {}

    const whereSearch = search
      ? {
          OR: [
            { user: { fullName: { contains: search, mode: 'insensitive' as const } } },
            { user: { email:    { contains: search, mode: 'insensitive' as const } } },
            { businessName:     { contains: search, mode: 'insensitive' as const } },
            { ntn:              { contains: search, mode: 'insensitive' as const } },
            { cnic:             { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    return this.prisma.clientProfile.findMany({
      where: { ...whereTrainee, ...whereSearch },
      include: {
        user:           { select: { id: true, userCode: true, fullName: true, email: true, phone: true, isActive: true, hasPortalAccess: true, inviteToken: true, avatar: true } },
        trainee:        { select: { id: true, fullName: true } },
        representative: { select: { id: true, fullName: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, actorId: string, actorRole: Role) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id },
      include: {
        user:    { select: { id: true, userCode: true, fullName: true, email: true, phone: true, avatar: true, createdAt: true } },
        trainee: { select: { id: true, fullName: true } },
      },
    })

    if (!profile) throw new NotFoundException('Client not found')

    if (actorRole === Role.TRAINEE && profile.traineeId !== actorId) {
      throw new ForbiddenException('Access denied')
    }

    return profile
  }

  async findByUserId(userId: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      include: {
        user:    { select: { id: true, userCode: true, fullName: true, email: true, phone: true, avatar: true } },
        trainee: { select: { id: true, fullName: true } },
      },
    })
    if (!profile) throw new NotFoundException('Client profile not found')
    return profile
  }

  async updateProfile(id: string, dto: UpdateClientProfileDto) {
    const profile = await this.prisma.clientProfile.findUniqueOrThrow({
      where: { id },
      select: { userId: true },
    })

    const { fullName, phone, password, extraFields, dateOfBirth, salesTaxAuthorities, hasWhtService, ...profileFields } = dto

    const userUpdates: Record<string, any> = {}
    if (fullName)           userUpdates.fullName = fullName
    if (phone !== undefined) userUpdates.phone = phone
    if (password)           userUpdates.password = await bcrypt.hash(password, 12)

    if (Object.keys(userUpdates).length > 0) {
      await this.prisma.user.update({ where: { id: profile.userId }, data: userUpdates })
    }

    return this.prisma.clientProfile.update({
      where: { id },
      data: {
        ...profileFields,
        ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
        ...(salesTaxAuthorities !== undefined ? { salesTaxAuthorities } : {}),
        ...(hasWhtService !== undefined ? { hasWhtService } : {}),
        ...(extraFields !== undefined ? { extraFields: extraFields as any } : {}),
        ...(dto.representativeId !== undefined ? { representativeId: dto.representativeId || null } : {}),
      },
      include: {
        user:    { select: { id: true, fullName: true, email: true, phone: true } },
        trainee: { select: { id: true, fullName: true } },
      },
    })
  }

  async toggleActive(id: string) {
    const profile = await this.prisma.clientProfile.findUnique({ where: { id }, select: { userId: true } })
    if (!profile) throw new NotFoundException('Client not found')
    const user = await this.prisma.user.findUnique({ where: { id: profile.userId } })
    if (!user) throw new NotFoundException('User not found')
    return this.prisma.user.update({
      where: { id: profile.userId },
      data:  { isActive: !user.isActive },
      select: { isActive: true },
    })
  }

  async togglePortalAccess(id: string) {
    const profile = await this.prisma.clientProfile.findUnique({ where: { id }, select: { userId: true } })
    if (!profile) throw new NotFoundException('Client not found')
    const user = await this.prisma.user.findUnique({ where: { id: profile.userId }, select: { hasPortalAccess: true } })
    if (!user) throw new NotFoundException('User not found')
    return this.prisma.user.update({
      where:  { id: profile.userId },
      data:   { hasPortalAccess: !user.hasPortalAccess },
      select: { hasPortalAccess: true },
    })
  }

  async sendInvite(id: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where:   { id },
      include: { user: { select: { id: true, fullName: true, email: true, hasPortalAccess: true } } },
    })
    if (!profile) throw new NotFoundException('Client not found')
    if (!profile.user.hasPortalAccess) throw new BadRequestException('Enable portal access first before sending an invite.')

    const token   = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000)

    await this.prisma.user.update({
      where: { id: profile.user.id },
      data:  { inviteToken: token, inviteTokenExp: expires },
    })

    const clientUrl = this.config.get<string>('clientUrl') ?? 'http://localhost:3000'
    const inviteUrl = `${clientUrl}/set-password?token=${token}`

    await this.email.sendPortalInvite(profile.user.email, profile.user.fullName, inviteUrl)

    return { message: 'Invite sent successfully.' }
  }

  async acceptInvite(token: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: token } })
    if (!user) throw new BadRequestException('Invalid or expired invite link.')
    if (!user.inviteTokenExp || user.inviteTokenExp < new Date()) {
      throw new BadRequestException('This invite link has expired. Please request a new one.')
    }

    const hashed = await bcrypt.hash(password, 12)
    await this.prisma.user.update({
      where: { id: user.id },
      data:  { password: hashed, inviteToken: null, inviteTokenExp: null, isActive: true },
    })

    return { message: 'Password set successfully. You can now log in.' }
  }
}
