import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common'
import { RolePermissionsService } from './role-permissions.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Role } from '@ca-firm/shared'

@Controller('role-permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolePermissionsController {
  constructor(private svc: RolePermissionsService) {}

  // Admin/Partner only, get full permission matrix
  @Get()
  @Roles(Role.ADMIN, Role.PARTNER)
  getAll() {
    return this.svc.getAll()
  }

  // Admin/Partner only, get feature definitions
  @Get('features')
  @Roles(Role.ADMIN, Role.PARTNER)
  getFeatures() {
    return this.svc.getFeatures()
  }

  // Any logged in user, get their own permissions
  @Get('my')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  getMyPermissions(@CurrentUser() user: { role: Role }) {
    // ADMIN always has full access and is not configurable
    if (user.role === Role.ADMIN) return { all: true }
    // All other roles (including PARTNER) check DB
    return this.svc.getForRole(user.role)
  }

  // Admin/Partner only, toggle a permission
  @Patch(':role/:feature')
  @Roles(Role.ADMIN, Role.PARTNER)
  toggle(
    @Param('role') role: string,
    @Param('feature') feature: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.svc.toggle(role, feature, enabled)
  }
}
