import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { FormFieldsService } from './form-fields.service'
import { CreateFieldDto } from './dto/create-field.dto'
import { UpdateFieldsDto } from './dto/update-fields.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'

@Controller('crm/form-fields')
@UseGuards(JwtAuthGuard)
export class FormFieldsController {
  constructor(private formFields: FormFieldsService) {}

  // ── Public, any authenticated user (drives their own Profile form) ────────
  @Get('public')
  getPublic(@Query('form_type') formType?: string) {
    return this.formFields.getPublicFields(formType)
  }

  // ── Admin management. Partner only ─────────────────────────────────────────
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PARTNER)
  getAll(@Query('form_type') formType?: string) {
    return this.formFields.getFields(formType)
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PARTNER)
  update(@Body() dto: UpdateFieldsDto) {
    return this.formFields.updateFields(dto.form_type, dto)
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PARTNER)
  create(@Body() dto: CreateFieldDto) {
    return this.formFields.createField(dto.form_type, dto)
  }

  @Delete(':formType/:fieldKey')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PARTNER)
  remove(@Param('formType') formType: string, @Param('fieldKey') fieldKey: string) {
    return this.formFields.deleteField(formType, fieldKey)
  }
}
