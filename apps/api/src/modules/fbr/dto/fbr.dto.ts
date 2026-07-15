import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateFbrCaseDto {
  @IsString() clientId: string
  @IsString() entryPoint: string
  @IsString() taxType: string
  @IsOptional() @IsString() taxYear?: string
  @IsOptional() @IsString() noticeSection?: string
  @IsOptional() @IsString() noticeNumber?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() assignedToId?: string
  @IsOptional() @IsString() authority?: string
}

export class UpdateFbrCaseDto {
  @IsOptional() @IsString() taxYear?: string
  @IsOptional() @IsString() noticeSection?: string
  @IsOptional() @IsString() noticeNumber?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() assignedToId?: string
  @IsOptional() @IsString() currentStage?: string
}

export class CreateNoticeSectionDto {
  @IsString() taxType: string
  @IsString() section: string
  @IsOptional() @IsNumber() sortOrder?: number
}

export class CreateNoticeRoundDto {
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateNoticeRoundDto {
  @IsOptional() @IsString()  noticeDate?: string
  @IsOptional() @IsString()  dueDate?: string
  @IsOptional() @IsBoolean() adjournmentApplied?: boolean
  @IsOptional() @IsString()  adjournmentDate?: string
  @IsOptional() @IsString()  docListCreatedAt?: string
  @IsOptional() @IsString()  docListApprovedAt?: string
  @IsOptional() @IsString()  docListApprovedById?: string
  @IsOptional() @IsString()  draftPreparedAt?: string
  @IsOptional() @IsString()  internalReviewedAt?: string
  @IsOptional() @IsString()  internalReviewById?: string
  @IsOptional() @IsString()  partnerApprovedAt?: string
  @IsOptional() @IsString()  partnerApprovedById?: string
  @IsOptional() @IsString()  submissionMethod?: string
  @IsOptional() @IsString()  submittedAt?: string
  @IsOptional() @IsString()  submissionRef?: string
  @IsOptional() @IsString()  outcome?: string
  @IsOptional() @IsString()  orderDate?: string
  @IsOptional() @IsBoolean() challanPaid?: boolean
  @IsOptional() @IsString()  challanPaidAt?: string
  @IsOptional() @IsString()  challanRef?: string
  @IsOptional() @IsString()  notes?: string
  @IsOptional() @IsString()  closedAt?: string
}

export class CreateAppealDto {
  @IsOptional() @IsString()  appealType?: string
  @IsOptional() @IsBoolean() isLate?: boolean
  @IsOptional() @IsString()  notes?: string
}

export class UpdateAppealDto {
  @IsOptional() @IsString()  appealType?: string
  @IsOptional() @IsBoolean() isLate?: boolean
  @IsOptional() @IsBoolean() condonationFiled?: boolean
  @IsOptional() @IsString()  feeChallanRef?: string
  @IsOptional() @IsString()  feePaidAt?: string
  @IsOptional() @IsString()  submissionMethod?: string
  @IsOptional() @IsString()  groundsPreparedAt?: string
  @IsOptional() @IsString()  internalReviewedAt?: string
  @IsOptional() @IsString()  internalReviewById?: string
  @IsOptional() @IsString()  partnerApprovedAt?: string
  @IsOptional() @IsString()  partnerApprovedById?: string
  @IsOptional() @IsString()  submittedAt?: string
  @IsOptional() @IsString()  submissionRef?: string
  @IsOptional() @IsString()  outcome?: string
  @IsOptional() @IsString()  orderDate?: string
  @IsOptional() @IsBoolean() challanPaid?: boolean
  @IsOptional() @IsString()  challanPaidAt?: string
  @IsOptional() @IsString()  challanRef?: string
  @IsOptional() @IsString()  closedAt?: string
  @IsOptional() @IsString()  notes?: string
}

export class CreateStayDto {
  @IsOptional() @IsString() reason?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateStayDto {
  @IsOptional() @IsString() reason?: string
  @IsOptional() @IsString() reviewedAt?: string
  @IsOptional() @IsString() reviewedById?: string
  @IsOptional() @IsString() submissionMethod?: string
  @IsOptional() @IsString() submittedAt?: string
  @IsOptional() @IsString() submissionRef?: string
  @IsOptional() @IsString() hearingDate?: string
  @IsOptional() @IsString() outcome?: string
  @IsOptional() @IsString() decidedAt?: string
  @IsOptional() @IsString() notes?: string
}

export class CreateFbrAttachmentDto {
  @IsString() url: string
  @IsOptional() @IsString() label?: string
}

export class AddHearingDto {
  @IsString()               scheduledDate: string
  @IsOptional() @IsString() appealId?: string
  @IsOptional() @IsString() notes?: string
}

export class UpdateHearingDto {
  @IsOptional() @IsString() scheduledDate?: string
  @IsOptional() @IsString() adjournedTo?: string
  @IsOptional() @IsString() outcome?: string
  @IsOptional() @IsString() notes?: string
}

export class SendBackDto {
  @IsString() step: string
  @IsString() @MinLength(5) comment: string
}
