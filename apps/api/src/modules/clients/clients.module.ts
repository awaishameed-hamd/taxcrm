import { Module } from '@nestjs/common'
import { ClientsService } from './clients.service'
import { ClientsController } from './clients.controller'
import { ClientRepresentativesService } from './client-representatives.service'
import { ClientRepresentativesController } from './client-representatives.controller'
import { EmailModule } from '../email/email.module'

@Module({
  imports:     [EmailModule],
  controllers: [ClientsController, ClientRepresentativesController],
  providers:   [ClientsService, ClientRepresentativesService],
  exports:     [ClientsService, ClientRepresentativesService],
})
export class ClientsModule {}
