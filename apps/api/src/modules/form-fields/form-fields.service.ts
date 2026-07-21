import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateFieldDto } from './dto/create-field.dto'
import { UpdateFieldsDto } from './dto/update-fields.dto'

const ALLOWED_FORM_TYPES = ['user', 'sale', 'client']

@Injectable()
export class FormFieldsService {
  constructor(private prisma: PrismaService) {}

  private resolveFormType(formType?: string): string {
    return formType && ALLOWED_FORM_TYPES.includes(formType) ? formType : 'user'
  }

  // ── Admin management view, all fields for a form type ──────────────────────
  async getFields(formType?: string) {
    return this.prisma.formFieldSetting.findMany({
      where:   { formType: this.resolveFormType(formType) },
      orderBy: { sortOrder: 'asc' },
    })
  }

  // ── Public view, only visible fields, minimal payload ──────────────────────
  async getPublicFields(formType?: string) {
    return this.prisma.formFieldSetting.findMany({
      where:   { formType: this.resolveFormType(formType), isVisible: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        fieldKey: true, label: true, placeholder: true, isRequired: true,
        fieldType: true, options: true, isCore: true, section: true,
        colSpan: true, textareaRows: true,
      },
    })
  }

  // ── Bulk update (reorder, relabel, toggle, resize) ──────────────────────────
  async updateFields(formType: string | undefined, dto: UpdateFieldsDto) {
    const type = this.resolveFormType(formType)

    await this.prisma.$transaction(
      dto.fields.map((f) =>
        this.prisma.formFieldSetting.updateMany({
          where: { formType: type, fieldKey: f.field_key },
          data: {
            label:         f.label,
            isVisible:     f.is_visible,
            isRequired:    !!f.is_required,
            sortOrder:     f.sort_order ?? 0,
            placeholder:   f.placeholder ?? null,
            section:       f.section ?? null,
            colSpan:       f.col_span ?? 'third',
            textareaRows:  Math.max(1, Math.min(20, f.textarea_rows ?? 3)),
            ...(f.field_type ? { fieldType: f.field_type } : {}),
            ...(f.options !== undefined ? { options: (f.options?.length ? f.options : null) as any } : {}),
          },
        }),
      ),
    )

    return { message: 'Form fields updated.' }
  }

  // ── Create a brand-new custom field ──────────────────────────────────────────
  async createField(formType: string | undefined, dto: CreateFieldDto) {
    const type = this.resolveFormType(formType)

    const existing = await this.prisma.formFieldSetting.findUnique({
      where: { formType_fieldKey: { formType: type, fieldKey: dto.field_key } },
    })
    if (existing) throw new ConflictException('A field with this key already exists for this form.')

    return this.prisma.formFieldSetting.create({
      data: {
        formType:     type,
        fieldKey:     dto.field_key,
        label:        dto.label,
        fieldType:    dto.field_type,
        section:      dto.section ?? null,
        placeholder:  dto.placeholder ?? null,
        colSpan:      dto.col_span ?? (dto.field_type === 'textarea' ? 'full' : 'third'),
        textareaRows: dto.textarea_rows ?? 3,
        isVisible:    dto.is_visible ?? true,
        isRequired:   dto.is_required ?? false,
        options:      dto.field_type === 'select' && dto.options?.length ? dto.options : undefined,
        sortOrder:    dto.sort_order ?? 999,
        isCore:       false,
      },
    })
  }

  // ── Delete a non-core custom field ───────────────────────────────────────────
  async deleteField(formType: string, fieldKey: string) {
    const type  = this.resolveFormType(formType)
    const field = await this.prisma.formFieldSetting.findUnique({
      where: { formType_fieldKey: { formType: type, fieldKey } },
    })
    if (!field) throw new NotFoundException('Field not found.')
    if (field.isCore) throw new ForbiddenException('Core fields cannot be deleted.')

    await this.prisma.formFieldSetting.delete({ where: { id: field.id } })
    return { message: 'Field deleted.' }
  }
}
