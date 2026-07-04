import { Module } from '@nestjs/common'
import { IncomeTaxReturnsController } from './income-tax-returns.controller'
import { IncomeTaxReturnsService } from './income-tax-returns.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports:     [PrismaModule],
  controllers: [IncomeTaxReturnsController],
  providers:   [IncomeTaxReturnsService],
  exports:     [IncomeTaxReturnsService],
})
export class IncomeTaxReturnsModule {}
