import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@ca-firm/shared'
import { AuditService } from './audit.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import {
  CreateEngagementDto, UpdateEngagementDto, SetTeamDto,
  CreateWorkingPaperDto, UpdateWorkingPaperDto, ToggleStepDto, ReviewWorkingPaperDto,
  CreateReviewPointDto, RespondReviewPointDto, AddAttachmentDto, SendBackDto,
} from './dto/audit.dto'

// Every role below is allowed through the guard and then filtered by division
// inside the service, the same way FBR gates its manager-only fields: a tax
// trainee and an audit trainee are both TRAINEE, so the role alone cannot tell
// them apart.
const STAFF = [Role.ADMIN, Role.PARTNER, Role.MANAGER, Role.TEAM_LEAD, Role.TRAINEE]

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF)
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get('areas')
  areas() {
    return this.svc.listAreas()
  }

  @Get('staff')
  staff() {
    return this.svc.assignableStaff()
  }

  @Get('summary')
  summary(@Req() req: any) {
    return this.svc.summary(req.user)
  }

  @Get('engagements')
  list(
    @Req() req: any,
    @Query('taskType') taskType?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.svc.listEngagements(req.user, taskType, status, clientId)
  }

  @Get('engagements/:id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.svc.getEngagement(id, req.user)
  }

  @Post('engagements')
  create(@Body() dto: CreateEngagementDto, @Req() req: any) {
    return this.svc.createEngagement(dto, req.user)
  }

  @Patch('engagements/:id')
  update(@Param('id') id: string, @Body() dto: UpdateEngagementDto, @Req() req: any) {
    return this.svc.updateEngagement(id, dto, req.user)
  }

  @Delete('engagements/:id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteEngagement(id, req.user)
  }

  @Post('engagements/:id/team')
  setTeam(@Param('id') id: string, @Body() dto: SetTeamDto, @Req() req: any) {
    return this.svc.setTeam(id, dto, req.user)
  }

  @Post('engagements/:id/sign-off')
  signOff(@Param('id') id: string, @Req() req: any) {
    return this.svc.signOff(id, req.user)
  }

  @Post('engagements/:id/send-back')
  sendBack(@Param('id') id: string, @Body() dto: SendBackDto, @Req() req: any) {
    return this.svc.sendBack(id, dto.reason, req.user)
  }

  // ── Working papers ─────────────────────────────────────────────────────────
  @Post('engagements/:id/working-papers')
  addPaper(@Param('id') id: string, @Body() dto: CreateWorkingPaperDto, @Req() req: any) {
    return this.svc.createWorkingPaper(id, dto, req.user)
  }

  @Patch('working-papers/:id')
  updatePaper(@Param('id') id: string, @Body() dto: UpdateWorkingPaperDto, @Req() req: any) {
    return this.svc.updateWorkingPaper(id, dto, req.user)
  }

  @Delete('working-papers/:id')
  deletePaper(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteWorkingPaper(id, req.user)
  }

  @Post('working-papers/:id/submit')
  submitPaper(@Param('id') id: string, @Req() req: any) {
    return this.svc.submitWorkingPaper(id, req.user)
  }

  @Post('working-papers/:id/review')
  reviewPaper(@Param('id') id: string, @Body() dto: ReviewWorkingPaperDto, @Req() req: any) {
    return this.svc.reviewWorkingPaper(id, dto, req.user)
  }

  @Patch('steps/:id')
  toggleStep(@Param('id') id: string, @Body() dto: ToggleStepDto, @Req() req: any) {
    return this.svc.toggleStep(id, dto.isDone, dto.notes, req.user)
  }

  // ── Review points ──────────────────────────────────────────────────────────
  @Post('working-papers/:id/review-points')
  addPoint(@Param('id') id: string, @Body() dto: CreateReviewPointDto, @Req() req: any) {
    return this.svc.addReviewPoint(id, dto, req.user)
  }

  @Patch('review-points/:id')
  respondPoint(@Param('id') id: string, @Body() dto: RespondReviewPointDto, @Req() req: any) {
    return this.svc.respondReviewPoint(id, dto, req.user)
  }

  // ── Attachments ────────────────────────────────────────────────────────────
  @Post('attachments')
  addAttachment(@Body() dto: AddAttachmentDto, @Req() req: any) {
    return this.svc.addAttachment(dto, req.user)
  }

  @Delete('attachments/:id')
  removeAttachment(@Param('id') id: string, @Req() req: any) {
    return this.svc.removeAttachment(id, req.user)
  }
}
