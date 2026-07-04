import { Body, Controller, Put, UseGuards } from '@nestjs/common'
import { ProfileService } from './profile.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private profile: ProfileService) {}

  @Put()
  async update(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return { user: await this.profile.update(user.id, dto) }
  }

  @Put('password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(user.id, dto)
  }
}
