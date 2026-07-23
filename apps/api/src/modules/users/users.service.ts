import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
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

  /**
   * Permanently deletes a staff user, for accounts created by mistake, as
   * opposed to toggleActive which only disables login.
   *
   * A task belongs to the person performing it, so the only thing that blocks a
   * delete is a task assigned to this user: their own pipeline tasks as trainee,
   * or general tasks assigned to them. Tasks they merely created or reviewed for
   * someone else do not block, since the task is really the assignee's; that
   * authorship is simply handed to whoever is doing the delete, so a manager can
   * be removed without disturbing the trainee's work.
   */
  async deleteUser(id: string, actorId: string, actorRole: Role) {
    if (id === actorId) throw new BadRequestException('You cannot delete your own account.')

    const user = await this.prisma.user.findUnique({
      where:  { id },
      select: {
        id: true, fullName: true, userCode: true, role: true,
        _count: {
          select: {
            salesTaxTasks: true,   // pipeline tasks assigned to them as trainee
            assignedTasks: true,   // general tasks assigned to them
          },
        },
      },
    })
    if (!user) throw new NotFoundException('User not found')

    // Same ceiling as creating: you can only delete roles you could create, so
    // no one deletes a peer or a senior, and Team Leads and Trainees delete no one.
    if (!this.getCreatableRoles(actorRole).includes(user.role as Role)) {
      throw new ForbiddenException(`You do not have permission to delete a ${user.role}.`)
    }

    // Only tasks they are actually performing count. A creator or reviewer can go.
    const owned = user._count.salesTaxTasks + user._count.assignedTasks
    if (owned > 0) {
      throw new BadRequestException(
        `${user.fullName} still has ${owned} task${owned === 1 ? '' : 's'} assigned to them. ` +
        `Reassign those tasks first, or disable the account instead.`,
      )
    }

    await this.prisma.$transaction(async tx => {
      // Chat messages have a hard foreign key, and are not work, so clear them.
      await tx.message.deleteMany({ where: { senderId: id } })
      await tx.conversationParticipant.deleteMany({ where: { userId: id } })
      // These are all "who did this" metadata on work that belongs to others, and
      // have required author fields. Hand them to the person doing the delete so
      // the underlying task, case or step is untouched.
      await tx.task.updateMany({ where: { createdById: id }, data: { createdById: actorId } })
      await tx.salesTaxTaskHistory.updateMany({ where: { actedById: id }, data: { actedById: actorId } })
      await tx.fbrCase.updateMany({ where: { createdById: id }, data: { createdById: actorId } })
      await tx.fbrAttachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: actorId } })
      // The rest release automatically: clients, trainees, recorded payments,
      // created invoices, reviewed leaves and FBR assignments all null out, while
      // attendance, notifications, sessions and the user's own leaves cascade away.
      await tx.user.delete({ where: { id } })
    })

    return { message: 'User deleted permanently.' }
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
