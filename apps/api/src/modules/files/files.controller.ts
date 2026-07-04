import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FilesService } from './files.service'

@Controller('files')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(private svc: FilesService) {}

  @Get()
  getFolders(@Query('clientId') clientId: string, @Query('taxType') taxType: string) {
    return this.svc.getFolders(clientId, taxType ?? 'SALES_TAX')
  }
}
