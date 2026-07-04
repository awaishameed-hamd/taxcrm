import { Module } from '@nestjs/common'
import { RolePermissionsService } from './role-permissions.service'
import { RolePermissionsController } from './role-permissions.controller'

@Module({
  controllers: [RolePermissionsController],
  providers:   [RolePermissionsService],
  exports:     [RolePermissionsService],
})
export class RolePermissionsModule {}
