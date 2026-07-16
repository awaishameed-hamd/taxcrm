import { Module } from '@nestjs/common'
import { ClientLoginDetailsService } from './client-login-details.service'
import { ClientLoginDetailsController } from './client-login-details.controller'
import { ClientsModule } from '../clients/clients.module'

@Module({
  imports:     [ClientsModule],
  controllers: [ClientLoginDetailsController],
  providers:   [ClientLoginDetailsService],
})
export class ClientLoginDetailsModule {}
