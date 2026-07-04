import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertIncomeTaxReturnDto } from './dto/upsert-income-tax-return.dto'

@Injectable()
export class IncomeTaxReturnsService {
  constructor(private prisma: PrismaService) {}

  async upsert(dto: UpsertIncomeTaxReturnDto) {
    const { clientId, taskId, periodYear, ...fields } = dto
    return this.prisma.incomeTaxReturn.upsert({
      where:  { clientId_periodYear: { clientId, periodYear } },
      create: { clientId, taskId, periodYear, ...fields },
      update: { taskId, ...fields },
    })
  }

  async findByClient(clientId: string) {
    return this.prisma.incomeTaxReturn.findMany({
      where:   { clientId },
      orderBy: { periodYear: 'asc' },
    })
  }
}
