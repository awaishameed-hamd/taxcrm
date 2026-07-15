import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertIncomeTaxReturnDto } from './dto/upsert-income-tax-return.dto'
import { assertClientAccess } from '../../common/utils/client-access.util'

@Injectable()
export class IncomeTaxReturnsService {
  constructor(private prisma: PrismaService) {}

  async upsert(dto: UpsertIncomeTaxReturnDto, actorId: string, actorRole: string) {
    const { clientId, taskId, periodYear, ...fields } = dto
    await assertClientAccess(this.prisma, clientId, actorId, actorRole as any)
    return this.prisma.incomeTaxReturn.upsert({
      where:  { clientId_periodYear: { clientId, periodYear } },
      create: { clientId, taskId, periodYear, ...fields },
      update: { taskId, ...fields },
    })
  }

  async findByClient(clientId: string, actorId: string, actorRole: string) {
    await assertClientAccess(this.prisma, clientId, actorId, actorRole as any)
    return this.prisma.incomeTaxReturn.findMany({
      where:   { clientId },
      orderBy: { periodYear: 'asc' },
    })
  }
}
