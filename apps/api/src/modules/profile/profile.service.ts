import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { ChangePasswordDto } from './dto/change-password.dto'

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async update(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    if (user.profileLocked) {
      throw new ForbiddenException('Your profile is locked. Contact an administrator.')
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
      if (existing) throw new ConflictException('Email already in use')
    }

    const { extraFields, dateOfBirth, dateOfJoining, ...rest } = dto

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        ...(dateOfBirth !== undefined   ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
        ...(dateOfJoining !== undefined ? { dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null } : {}),
        ...(extraFields !== undefined ? { extraFields: extraFields as any } : {}),
      },
    })

    return this.profileData(updated)
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    const matches = await bcrypt.compare(dto.current_password, user.password)
    if (!matches) throw new UnauthorizedException('Current password is incorrect.')

    const hashed = await bcrypt.hash(dto.new_password, 12)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })

    return { message: 'Password updated successfully.' }
  }

  // Shapes the full profile payload, mirrors the Call Center CRM's profileData()
  profileData(user: any) {
    return {
      id:                   user.id,
      userCode:             user.userCode,
      role:                 user.role,
      fullName:             user.fullName,
      firstName:            user.firstName,
      midName:              user.midName,
      lastName:             user.lastName,
      email:                user.email,
      phone:                user.phone,
      dateOfBirth:          user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      dateOfJoining:        user.dateOfJoining?.toISOString().slice(0, 10) ?? null,
      department:           user.department,
      experience:           user.experience,
      cnic:                 user.cnic,
      permanentAddress:     user.permanentAddress,
      currentAddress:       user.currentAddress,
      bank:                 user.bank,
      accountTitle:         user.accountTitle,
      bankAccountNo:        user.bankAccountNo,
      ibanNo:               user.ibanNo,
      basicSalary:          user.basicSalary,
      punctualityAllowance: user.punctualityAllowance,
      travellingAllowance:  user.travellingAllowance,
      otherAllowance:       user.otherAllowance,
      profileLocked:        user.profileLocked,
      isActive:             user.isActive,
      avatar:               user.avatar,
      extraFields:          user.extraFields ?? {},
    }
  }
}
