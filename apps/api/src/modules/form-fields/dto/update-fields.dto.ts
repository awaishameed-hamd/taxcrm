import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator'

const FIELD_TYPES = ['text', 'number', 'select', 'date', 'textarea', 'amount_pkr']
const COL_SPANS   = ['full', 'two_thirds', 'half', 'third']

export class FieldUpdateEntryDto {
  @IsString() field_key: string
  @IsString() label: string

  @IsOptional() @IsBoolean()              is_visible?: boolean
  @IsOptional() @IsBoolean()              is_required?: boolean
  @IsOptional() @IsInt()                  sort_order?: number
  @IsOptional() @IsString()               placeholder?: string
  @IsOptional() @IsString()               section?: string
  @IsOptional() @IsIn(COL_SPANS)          col_span?: string
  @IsOptional() @IsInt()                  textarea_rows?: number
  @IsOptional() @IsIn(FIELD_TYPES)        field_type?: string
  @IsOptional() @IsString({ each: true })  options?: string[]
}

export class UpdateFieldsDto {
  @IsOptional() @IsString() form_type?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldUpdateEntryDto)
  fields: FieldUpdateEntryDto[]
}
