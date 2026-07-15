import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertSalesTaxReturnDto } from './dto/upsert-sales-tax-return.dto'
import { assertClientAccess } from '../../common/utils/client-access.util'

@Injectable()
export class SalesTaxReturnsService {
  constructor(private prisma: PrismaService) {}

  async upsert(dto: UpsertSalesTaxReturnDto, actorId: string, actorRole: string) {
    const { clientId, taskId, periodMonth, periodYear, authority = 'FBR', returnType = 'ORIGINAL', ...fields } = dto
    await assertClientAccess(this.prisma, clientId, actorId, actorRole as any)
    return this.prisma.salesTaxReturn.upsert({
      where:  { clientId_periodMonth_periodYear_authority_returnType: { clientId, periodMonth, periodYear, authority, returnType } },
      create: { clientId, taskId, periodMonth, periodYear, authority, returnType, ...fields },
      update: { taskId, ...fields },
    })
  }

  async findByClient(clientId: string, actorId: string, actorRole: string, authority?: string) {
    await assertClientAccess(this.prisma, clientId, actorId, actorRole as any)
    return this.prisma.salesTaxReturn.findMany({
      where:   { clientId, ...(authority ? { authority } : {}) },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    })
  }
}
