import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

const FIELD_TYPES = ['text', 'number', 'select', 'multiselect', 'date', 'textarea', 'amount_pkr']
const COL_SPANS   = ['full', 'two_thirds', 'half', 'third']

export class CreateFieldDto {
  @IsOptional() @IsString() form_type?: string

  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'Must start with a letter; only a-z, 0-9, underscores' })
  @MaxLength(60)
  field_key: string

  @IsString()
  @MaxLength(100)
  label: string

  @IsIn(FIELD_TYPES)
  field_type: string

  @IsOptional() @IsString() @MaxLength(100)  section?: string
  @IsOptional() @IsString() @MaxLength(255)  placeholder?: string
  @IsOptional() @IsIn(COL_SPANS)             col_span?: string
  @IsOptional() @IsInt() @Min(1) @Max(20)     textarea_rows?: number
  @IsOptional() @IsBoolean()                  is_visible?: boolean
  @IsOptional() @IsBoolean()                  is_required?: boolean
  @IsOptional() @IsString({ each: true })     options?: string[]
  @IsOptional() @IsInt()                      sort_order?: number
}
