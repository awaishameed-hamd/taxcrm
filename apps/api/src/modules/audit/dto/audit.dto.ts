import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class CreateEngagementDto {
  @IsString() @IsNotEmpty() clientId: string
  @IsString() @IsNotEmpty() title: string
  @IsString() @IsNotEmpty() periodEndDate: string

  @IsOptional() @IsString() taskType?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() periodLabel?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsNumber() @Min(0) materiality?: number
  @IsOptional() @IsNumber() @Min(0) performanceMateriality?: number

  // The team is named when the engagement is raised: one lead, any number of members
  @IsOptional() @IsString() teamLeadId?: string
  @IsOptional() @IsArray() @IsString({ each: true }) memberIds?: string[]
}

export class UpdateEngagementDto {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() phase?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsNumber() @Min(0) materiality?: number
  @IsOptional() @IsNumber() @Min(0) performanceMateriality?: number
  @IsOptional() @IsString() riskAssessment?: string
  @IsOptional() @IsString() teamLeadId?: string
}

export class SetTeamDto {
  @IsOptional() @IsString() teamLeadId?: string
  @IsOptional() @IsArray() @IsString({ each: true }) memberIds?: string[]
}

export class CreateWorkingPaperDto {
  @IsOptional() @IsString() areaId?: string
  @IsOptional() @IsString() areaName?: string
  @IsOptional() @IsString() assignedToId?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsNumber() currentYearAmount?: number
  @IsOptional() @IsNumber() priorYearAmount?: number
  // Leave empty to get the standard procedure checklist
  @IsOptional() @IsArray() @IsString({ each: true }) steps?: string[]
}

export class UpdateWorkingPaperDto {
  @IsOptional() @IsString() assignedToId?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsString() conclusion?: string
  @IsOptional() @IsString() dueDate?: string
  @IsOptional() @IsNumber() currentYearAmount?: number
  @IsOptional() @IsNumber() priorYearAmount?: number
}

export class ToggleStepDto {
  @IsBoolean() isDone: boolean
  @IsOptional() @IsString() notes?: string
}

export class ReviewWorkingPaperDto {
  @IsIn(['APPROVE', 'SEND_BACK']) action: 'APPROVE' | 'SEND_BACK'
  @IsOptional() @IsString() reason?: string
}

export class CreateReviewPointDto {
  @IsString() @IsNotEmpty() note: string
}

export class RespondReviewPointDto {
  @IsIn(['RESPOND', 'CLEAR']) action: 'RESPOND' | 'CLEAR'
  @IsOptional() @IsString() response?: string
}

export class AddAttachmentDto {
  @IsString() @IsNotEmpty() fileName: string
  @IsString() @IsNotEmpty() fileKey: string

  @IsOptional() @IsString() engagementId?: string
  @IsOptional() @IsString() workingPaperId?: string
  @IsOptional() @IsNumber() fileSize?: number
  @IsOptional() @IsString() mimeType?: string
  // FINANCIAL_STATEMENTS or AUDIT_REPORT release the completion gate
  @IsOptional() @IsString() kind?: string
}

export class SendBackDto {
  @IsString() @IsNotEmpty() reason: string
}
