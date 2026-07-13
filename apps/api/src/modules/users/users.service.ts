import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { generateUserCode } from '../../common/utils/user-code.util'

const USER_SELECT = {
  id:         true,
  userCode:   true,
  email:      true,
  fullName:   true,
  role:       true,
  phone:      true,
  avatar:     true,
  isActive:   true,
  teamLeadId: true,
  teamLead:   { select: { id: true, fullName: true } },
  createdAt:  true,
  updatedAt:  true,
}

const USER_SELECT_FULL = {
  ...USER_SELECT,
  firstName:            true,
  midName:              true,
  lastName:             true,
  profileLocked:        true,
  dateOfBirth:          true,
  dateOfJoining:        true,
  department:           true,
  experience:           true,
  cnic:                 true,
  permanentAddress:     true,
  currentAddress:       true,
  bank:                 true,
  accountTitle:         true,
  bankAccountNo:        true,
  ibanNo:               true,
  basicSalary:          true,
  punctualityAllowance: true,
  travellingAllowance:  true,
  otherAllowance:       true,
  extraFields:          true,
}

const PREFIX: Record<string, string> = {
  ADMIN: 'A', PARTNER: 'P', MANAGER: 'M', TEAM_LEAD: 'L', TRAINEE: 'T', CLIENT: 'C',
}
const PAD: Record<string, number> = {
  ADMIN: 3, PARTNER: 3, MANAGER: 3, TEAM_LEAD: 3, TRAINEE: 3, CLIENT: 7,
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(actorRole: Role, roleFilter?: Role, search?: string, status?: string) {
    const visibleRoles = this.getVisibleRoles(actorRole)

    const where: any = {
      role: roleFilter && visibleRoles.includes(roleFilter)
        ? roleFilter
        : { in: visibleRoles },
    }

    if (status === 'active')   where.isActive = true
    if (status === 'inactive') where.isActive = false

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
        { userCode: { contains: search, mode: 'insensitive' } },
        { phone:    { contains: search, mode: 'insensitive' } },
      ]
    }

    return this.prisma.user.findMany({
      where,
      select:  USER_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id },
      select: { ...USER_SELECT_FULL, clientProfile: true },
    })
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async getNextCode(role: Role): Promise<string> {
    const key     = `userCode:${role}`
    const counter = await this.prisma.sequenceCounter.findUnique({ where: { key } })
    const nextVal = (counter?.value ?? 0) + 1
    const prefix  = PREFIX[role] ?? '?'
    const pad     = PAD[role] ?? 3
    const num     = String(nextVal).padStart(pad, '0')
    return role === Role.CLIENT ? `${prefix}-${num}` : `${prefix}${num}`
  }

  async create(dto: CreateUserDto, actorRole: Role) {
    this.assertCanCreate(actorRole, dto.role)

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already in use')

    const hashed   = await bcrypt.hash(dto.password, 12)
    const userCode = await generateUserCode(this.prisma, dto.role)

    const {
      fullName, email, phone, password, role,
      teamLeadId, dateOfBirth, dateOfJoining, extraFields,
      firstName, midName, lastName, department, experience,
      cnic, permanentAddress, currentAddress,
      bank, accountTitle, bankAccountNo, ibanNo,
      basicSalary, punctualityAllowance, travellingAllowance, otherAllowance,
    } = dto

    return this.prisma.user.create({
      data: {
        userCode,
        fullName: fullName ?? '', email, phone, password: hashed, role,
        ...(teamLeadId    ? { teamLeadId }                                          : {}),
        ...(dateOfBirth   ? { dateOfBirth:  new Date(dateOfBirth) }                 : {}),
        ...(dateOfJoining ? { dateOfJoining: new Date(dateOfJoining) }              : {}),
        ...(firstName     !== undefined ? { firstName }          : {}),
        ...(midName       !== undefined ? { midName }            : {}),
        ...(lastName      !== undefined ? { lastName }           : {}),
        ...(department    !== undefined ? { department }         : {}),
        ...(experience    !== undefined ? { experience }         : {}),
        ...(cnic          !== undefined ? { cnic }               : {}),
        ...(permanentAddress !== undefined ? { permanentAddress } : {}),
        ...(currentAddress   !== undefined ? { currentAddress }   : {}),
        ...(bank             !== undefined ? { bank }             : {}),
        ...(accountTitle     !== undefined ? { accountTitle }     : {}),
        ...(bankAccountNo    !== undefined ? { bankAccountNo }    : {}),
        ...(ibanNo           !== undefined ? { ibanNo }           : {}),
        ...(basicSalary         !== undefined ? { basicSalary }         : {}),
        ...(punctualityAllowance!== undefined ? { punctualityAllowance }: {}),
        ...(travellingAllowance !== undefined ? { travellingAllowance }  : {}),
        ...(otherAllowance      !== undefined ? { otherAllowance }       : {}),
        ...(extraFields ? { extraFields: extraFields as any } : {}),
        ...(role === Role.CLIENT ? { clientProfile: { create: {} } } : {}),
      },
      select: USER_SELECT,
    })
  }

  async update(id: string, dto: UpdateUserDto, actorRole: Role) {
    await this.findOne(id)
    if (dto.role !== undefined) this.assertCanCreate(actorRole, dto.role)
    const { dateOfBirth, dateOfJoining, extraFields, teamLeadId, ...rest } = dto as any
    return this.prisma.user.update({
      where:  { id },
      data:   {
        ...rest,
        ...(dateOfBirth   !== undefined ? { dateOfBirth:  dateOfBirth  ? new Date(dateOfBirth)  : null } : {}),
        ...(dateOfJoining !== undefined ? { dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null } : {}),
        ...(extraFields   !== undefined ? { extraFields:  extraFields as any } : {}),
        ...(teamLeadId    !== undefined ? { teamLeadId:   teamLeadId ?? null } : {}),
      },
      select: { ...USER_SELECT_FULL, teamLeadId: true },
    })
  }

  async toggleActive(id: string) {
    const user = await this.findOne(id)
    return this.prisma.user.update({
      where:  { id },
      data:   { isActive: !user.isActive },
      select: USER_SELECT,
    })
  }

  async updatePassword(id: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 12)
    return this.prisma.user.update({
      where:  { id },
      data:   { password: hashed },
      select: { id: true },
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getVisibleRoles(role: Role): Role[] {
    switch (role) {
      case Role.ADMIN:     return [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE, Role.CLIENT]
      case Role.PARTNER:   return [Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE, Role.CLIENT]
      case Role.MANAGER:   return [Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE, Role.CLIENT]
      case Role.TEAM_LEAD: return [Role.TEAM_LEAD, Role.TRAINEE]
      case Role.TRAINEE:   return [Role.CLIENT]
      default:             return []
    }
  }

  getCreatableRoles(role: Role): Role[] {
    switch (role) {
      case Role.ADMIN:   return [Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]
      case Role.PARTNER: return [Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]
      case Role.MANAGER: return [Role.TEAM_LEAD, Role.TRAINEE]
      default:           return []
    }
  }

  private assertCanCreate(actorRole: Role, targetRole: Role) {
    const allowed = this.getCreatableRoles(actorRole)
    if (!allowed.includes(targetRole)) {
      throw new ForbiddenException(`You cannot create users with role ${targetRole}`)
    }
  }
}
