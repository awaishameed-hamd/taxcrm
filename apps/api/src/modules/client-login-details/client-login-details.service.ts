import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClientsService } from '../clients/clients.service'
import { UpdateLoginDetailDto, CreateClientWithLoginDto } from './dto/client-login-detail.dto'

const SELECT = {
  id: true,
  authority: true,
  loginId: true,
  password: true,
  clientId: true,
  client: {
    select: {
      id: true,
      businessName: true,
      user: { select: { fullName: true, isActive: true } },
    },
  },
}

@Injectable()
export class ClientLoginDetailsService {
  constructor(
    private prisma: PrismaService,
    private clientsService: ClientsService,
  ) {}

  async list(search?: string) {
    return this.prisma.clientLoginDetail.findMany({
      where: search
        ? {
            client: {
              OR: [
                { businessName: { contains: search, mode: 'insensitive' } },
                { user: { fullName: { contains: search, mode: 'insensitive' } } },
              ],
            },
          }
        : undefined,
      select: SELECT,
      orderBy: [{ client: { businessName: 'asc' } }, { authority: 'asc' }],
    })
  }

  async update(id: string, dto: UpdateLoginDetailDto) {
    const row = await this.prisma.clientLoginDetail.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Login detail not found')

    if (dto.authority !== undefined && dto.authority !== row.authority) {
      const clash = await this.prisma.clientLoginDetail.findUnique({
        where: { clientId_authority: { clientId: row.clientId, authority: dto.authority } },
      })
      if (clash) throw new ConflictException('This client already has a login detail row for that authority')
    }

    return this.prisma.clientLoginDetail.update({
      where: { id },
      data: {
        ...(dto.authority !== undefined ? { authority: dto.authority } : {}),
        ...(dto.loginId   !== undefined ? { loginId: dto.loginId }     : {}),
        ...(dto.password  !== undefined ? { password: dto.password }   : {}),
      },
      select: SELECT,
    })
  }

  async delete(id: string) {
    const row = await this.prisma.clientLoginDetail.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Login detail not found')
    await this.prisma.clientLoginDetail.delete({ where: { id } })
    return { ok: true }
  }

  // Adding a row here for a brand-new client also creates the client itself,
  // keeping the Clients section and this sheet in sync in both directions.
  async createClientWithLogin(dto: CreateClientWithLoginDto) {
    const created = await this.clientsService.create({
      businessName: dto.businessName,
      traineeId:    dto.traineeId,
      salesTaxAuthorities: [dto.authority],
    })

    const clientId = created.clientProfile!.id
    return this.prisma.clientLoginDetail.update({
      where: { clientId_authority: { clientId, authority: dto.authority } },
      data:  { loginId: dto.loginId, password: dto.password },
      select: SELECT,
    })
  }
}
