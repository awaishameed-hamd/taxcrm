import { Module } from '@nestjs/common'
import { SalesTaxReturnsController } from './sales-tax-returns.controller'
import { SalesTaxReturnsService } from './sales-tax-returns.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports:     [PrismaModule],
  controllers: [SalesTaxReturnsController],
  providers:   [SalesTaxReturnsService],
  exports:     [SalesTaxReturnsService],
})
export class SalesTaxReturnsModule {}
