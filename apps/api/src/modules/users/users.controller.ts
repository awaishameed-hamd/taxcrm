import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('next-code')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getNextCode(@Query('role') role: Role) {
    return this.usersService.getNextCode(role)
  }

  @Get('creatable-roles')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  getCreatableRoles(@CurrentUser() user: { role: Role }) {
    return this.usersService.getCreatableRoles(user.role)
  }

  @Get()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE)
  findAll(
    @CurrentUser() user: { role: Role },
    @Query('role')   roleFilter?: Role,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.findAll(user.role, roleFilter, search, status)
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id)
  }

  @Post()
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { role: Role },
  ) {
    return this.usersService.create(dto, user.role)
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto)
  }

  @Patch(':id/toggle-active')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  toggleActive(@Param('id') id: string) {
    return this.usersService.toggleActive(id)
  }
}
