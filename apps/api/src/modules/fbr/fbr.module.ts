import { Module } from '@nestjs/common'
import { FbrController } from './fbr.controller'
import { FbrService } from './fbr.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [FbrController],
  providers: [FbrService],
})
export class FbrModule {}
