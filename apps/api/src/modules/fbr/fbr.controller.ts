import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '@ca-firm/shared'
import { FbrService } from './fbr.service'
import {
  CreateFbrCaseDto,
  UpdateFbrCaseDto,
  CreateNoticeRoundDto,
  UpdateNoticeRoundDto,
  CreateAppealDto,
  UpdateAppealDto,
  CreateStayDto,
  UpdateStayDto,
  AddHearingDto,
  UpdateHearingDto,
  CreateNoticeSectionDto,
  CreateFbrAttachmentDto,
} from './dto/fbr.dto'

const ALL = [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]

@Controller('fbr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FbrController {
  constructor(private readonly svc: FbrService) {}

  // ── Cases ─────────────────────────────────────────────────────────────────
  @Get('cases')
  @Roles(...ALL)
  listCases(
    @Req() req: any,
    @Query('clientId') clientId?: string,
    @Query('stage') stage?: string,
    @Query('taxType') taxType?: string,
  ) {
    return this.svc.listCases(req.user.id, req.user.role, clientId, stage, taxType)
  }

  @Get('cases/:id')
  @Roles(...ALL)
  getCase(@Param('id') id: string) {
    return this.svc.getCase(id)
  }

  @Post('cases')
  @Roles(...ALL)
  createCase(@Req() req: any, @Body() dto: CreateFbrCaseDto) {
    return this.svc.createCase(dto, req.user.id)
  }

  @Patch('cases/:id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  updateCase(@Param('id') id: string, @Body() dto: UpdateFbrCaseDto) {
    return this.svc.updateCase(id, dto)
  }

  @Post('cases/:id/close')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  closeCase(@Param('id') id: string, @Body('reason') reason: string) {
    return this.svc.closeCase(id, reason)
  }

  // ── Notice Rounds ─────────────────────────────────────────────────────────
  @Post('cases/:id/notice-rounds')
  @Roles(...ALL)
  addNoticeRound(@Param('id') caseId: string, @Body() dto: CreateNoticeRoundDto) {
    return this.svc.addNoticeRound(caseId, dto)
  }

  @Patch('notice-rounds/:id')
  @Roles(...ALL)
  updateNoticeRound(@Param('id') id: string, @Body() dto: UpdateNoticeRoundDto) {
    return this.svc.updateNoticeRound(id, dto)
  }

  // ── Appeal ────────────────────────────────────────────────────────────────
  @Post('cases/:id/appeal')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  createAppeal(@Param('id') caseId: string, @Body() dto: CreateAppealDto) {
    return this.svc.createAppeal(caseId, dto)
  }

  @Patch('appeals/:id')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD)
  updateAppeal(@Param('id') id: string, @Body() dto: UpdateAppealDto) {
    return this.svc.updateAppeal(id, dto)
  }

  // ── Stay Application ──────────────────────────────────────────────────────
  @Post('cases/:id/stay')
  @Roles(...ALL)
  createStay(@Param('id') caseId: string, @Body() dto: CreateStayDto) {
    return this.svc.createStay(caseId, dto)
  }

  @Patch('stays/:id')
  @Roles(...ALL)
  updateStay(@Param('id') id: string, @Body() dto: UpdateStayDto) {
    return this.svc.updateStay(id, dto)
  }

  @Post('stays/:id/resume')
  @Roles(Role.ADMIN, Role.PARTNER, Role.MANAGER)
  resumeFromStay(@Param('id') stayId: string, @Req() req: any) {
    return this.svc.resumeFromStay(stayId, req.user.id)
  }

  // ── Hearings ──────────────────────────────────────────────────────────────
  @Post('cases/:id/hearings')
  @Roles(...ALL)
  addHearing(@Param('id') caseId: string, @Body() dto: AddHearingDto) {
    return this.svc.addHearing(caseId, dto)
  }

  @Patch('hearings/:id')
  @Roles(...ALL)
  updateHearing(@Param('id') id: string, @Body() dto: UpdateHearingDto) {
    return this.svc.updateHearing(id, dto)
  }

  // ── Clients dropdown ──────────────────────────────────────────────────────
  @Get('clients')
  @Roles(...ALL)
  clients(@Req() req: any) {
    return this.svc.getClients(req.user.id, req.user.role)
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  @Post('notice-rounds/:id/attachments')
  @Roles(...ALL)
  addNoticeRoundAttachment(@Param('id') id: string, @Body() dto: CreateFbrAttachmentDto, @Req() req: any) {
    return this.svc.addAttachment('noticeRound', id, dto.url, dto.label, req.user.id)
  }

  @Post('appeals/:id/attachments')
  @Roles(...ALL)
  addAppealAttachment(@Param('id') id: string, @Body() dto: CreateFbrAttachmentDto, @Req() req: any) {
    return this.svc.addAttachment('appeal', id, dto.url, dto.label, req.user.id)
  }

  @Post('stays/:id/attachments')
  @Roles(...ALL)
  addStayAttachment(@Param('id') id: string, @Body() dto: CreateFbrAttachmentDto, @Req() req: any) {
    return this.svc.addAttachment('stay', id, dto.url, dto.label, req.user.id)
  }

  @Delete('attachments/:id')
  @Roles(...ALL)
  deleteAttachment(@Param('id') id: string) {
    return this.svc.deleteAttachment(id)
  }

  // ── Notice Sections ───────────────────────────────────────────────────────
  @Get('notice-sections')
  @Roles(...ALL)
  listNoticeSections(@Query('taxType') taxType?: string) {
    return this.svc.listNoticeSections(taxType)
  }

  @Post('notice-sections')
  @Roles(Role.ADMIN, Role.PARTNER)
  createNoticeSection(@Body() dto: CreateNoticeSectionDto) {
    return this.svc.createNoticeSection(dto)
  }

  @Delete('notice-sections/:id')
  @Roles(Role.ADMIN, Role.PARTNER)
  deleteNoticeSection(@Param('id') id: string) {
    return this.svc.deleteNoticeSection(id)
  }
}
