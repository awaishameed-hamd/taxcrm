import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FilesService } from './files.service'

@Controller('files')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(private svc: FilesService) {}

  @Get()
  getFolders(@Req() req: any, @Query('clientId') clientId: string, @Query('taxType') taxType: string) {
    return this.svc.getFolders(clientId, taxType ?? 'SALES_TAX', req.user.id, req.user.role)
  }
}
