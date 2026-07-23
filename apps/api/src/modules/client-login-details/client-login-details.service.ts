import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
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

  /**
   * Bulk import of authority logins from the Excel template. Each row attaches a
   * login to an existing client, matched by client code or business name, and
   * upserts the row for that authority. Best effort: a bad row is reported and
   * skipped. Blank login/password on an update are ignored so a re-import with
   * empty cells never wipes credentials already saved.
   */
  async bulkUpsertLogins(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('No rows to import.')
    if (rows.length > 1000) throw new BadRequestException('Please import at most 1000 rows at a time.')

    const clients = await this.prisma.clientProfile.findMany({
      select: { id: true, businessName: true, user: { select: { userCode: true } } },
    })
    const byCode = new Map<string, string>()
    const byName = new Map<string, string[]>()
    for (const c of clients) {
      if (c.user?.userCode) byCode.set(c.user.userCode.toUpperCase(), c.id)
      if (c.businessName) {
        const k = c.businessName.trim().toLowerCase()
        byName.set(k, [...(byName.get(k) ?? []), c.id])
      }
    }

    const str = (v: any) => (v === null || v === undefined ? '' : String(v).trim())
    const failed: { row: number; name: string; error: string }[] = []
    let saved = 0

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const excelRow = i + 2
      const who       = str(r.client)
      const authority = str(r.authority).toUpperCase()
      try {
        if (!who)       throw new Error('Client (name or code) is required')
        if (!authority) throw new Error('Authority is required')

        let clientId = byCode.get(who.toUpperCase())
        if (!clientId) {
          const ids = byName.get(who.toLowerCase()) ?? []
          if (ids.length === 0) throw new Error(`Client "${who}" not found. Import the client first, or use their code.`)
          if (ids.length > 1)   throw new Error(`More than one client named "${who}". Use the client code instead.`)
          clientId = ids[0]
        }

        const loginId  = str(r.loginId)
        const password = str(r.password)
        await this.prisma.clientLoginDetail.upsert({
          where:  { clientId_authority: { clientId, authority } },
          create: { clientId, authority, loginId: loginId || null, password: password || null },
          update: {
            ...(loginId  ? { loginId }  : {}),
            ...(password ? { password } : {}),
          },
        })
        saved++
      } catch (e: any) {
        failed.push({ row: excelRow, name: who, error: e?.message ?? 'Failed to import' })
      }
    }

    return { total: rows.length, created: saved, failedCount: failed.length, failed }
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
