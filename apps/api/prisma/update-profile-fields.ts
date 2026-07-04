import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Remove unwanted fields
  await prisma.formFieldSetting.deleteMany({
    where: {
      formType: 'user',
      fieldKey: { in: ['firstName', 'midName', 'lastName', 'experience',
                        'basicSalary', 'punctualityAllowance', 'travellingAllowance', 'otherAllowance',
                        'dateOfJoining', 'department'] }
    }
  })

  // New field list — clean structure
  const fields: any[] = [
    // ── Personal Information ────────────────────────────────────────────────
    { fieldKey: 'fullName',    label: 'Display Name',   fieldType: 'text', section: 'Personal Information', colSpan: 'half',  sortOrder: 1,  isCore: true,  placeholder: 'Full display name' },
    { fieldKey: 'email',       label: 'Email',          fieldType: 'text', section: 'Personal Information', colSpan: 'half',  sortOrder: 2,  isCore: false, placeholder: 'email@example.com' },
    { fieldKey: 'phone',       label: 'Phone',          fieldType: 'text', section: 'Personal Information', colSpan: 'half',  sortOrder: 3,  isCore: false, placeholder: '+92 3XX XXXXXXX'   },
    { fieldKey: 'dateOfBirth', label: 'Date of Birth',  fieldType: 'date', section: 'Personal Information', colSpan: 'third', sortOrder: 4,  isCore: false, placeholder: null                },
    { fieldKey: 'dateOfJoining',  label: 'Date of Joining', fieldType: 'date',   section: 'Personal Information', colSpan: 'third', sortOrder: 5, isCore: true,  placeholder: null },
    { fieldKey: 'department',     label: 'Department',      fieldType: 'select', section: 'Personal Information', colSpan: 'third', sortOrder: 6, isCore: false, options: ['Taxation', 'Audit and Assurance'] },
    { fieldKey: 'articlesType',   label: 'Articles Type',   fieldType: 'select', section: 'Personal Information', colSpan: 'third', sortOrder: 7, isCore: false, options: ['2.5 years', '3 years', '3.5 years'] },
    // ── CNIC & Address ──────────────────────────────────────────────────────
    { fieldKey: 'cnic',              label: 'CNIC',            fieldType: 'text',     section: 'CNIC & Address', colSpan: 'half', sortOrder: 8,  isCore: false, placeholder: '00000-0000000-0' },
    { fieldKey: 'permanentAddress',  label: 'Permanent Address', fieldType: 'textarea', section: 'CNIC & Address', colSpan: 'full', sortOrder: 9,  isCore: false, placeholder: 'Permanent address', textareaRows: 3 },
    { fieldKey: 'currentAddress',    label: 'Current Address',   fieldType: 'textarea', section: 'CNIC & Address', colSpan: 'full', sortOrder: 10, isCore: false, placeholder: 'Current address',   textareaRows: 3 },
    // ── Banking Details ─────────────────────────────────────────────────────
    { fieldKey: 'bank',          label: 'Bank',             fieldType: 'text', section: 'Banking Details', colSpan: 'half',  sortOrder: 11, isCore: false, placeholder: 'e.g. HBL'             },
    { fieldKey: 'accountTitle',  label: 'Account Title',    fieldType: 'text', section: 'Banking Details', colSpan: 'half',  sortOrder: 12, isCore: false, placeholder: 'Account holder name'  },
    { fieldKey: 'bankAccountNo', label: 'Bank Account No.', fieldType: 'text', section: 'Banking Details', colSpan: 'half',  sortOrder: 13, isCore: false, placeholder: 'XXXX-XXXXXXXXX-X'     },
    { fieldKey: 'ibanNo',        label: 'IBAN No.',         fieldType: 'text', section: 'Banking Details', colSpan: 'half',  sortOrder: 14, isCore: false, placeholder: 'PK36SCBL...'          },
  ]

  for (const f of fields) {
    const data: any = {
      formType: 'user', fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType,
      section: f.section, colSpan: f.colSpan, sortOrder: f.sortOrder, isCore: f.isCore,
      isVisible: true, isRequired: false,
      placeholder: f.placeholder ?? null,
      textareaRows: f.textareaRows ?? 3,
    }
    if (f.options) data.options = f.options
    await prisma.formFieldSetting.upsert({
      where:  { formType_fieldKey: { formType: 'user', fieldKey: f.fieldKey } },
      update: data,
      create: data,
    })
  }

  console.log('Profile fields updated.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
