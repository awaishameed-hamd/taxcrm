import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { generateUserCode } from '../src/common/utils/user-code.util'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database…')

  // ── Admin ─────────────────────────────────────────────────────────────────
  const adminPw = await bcrypt.hash('Admin@123', 12)
  const admin = await prisma.user.upsert({
    where:  { email: 'admin@asifassociates.com' },
    update: {},
    create: {
      userCode: await generateUserCode(prisma, Role.ADMIN),
      email:    'admin@asifassociates.com',
      fullName: 'Admin User',
      password: adminPw,
      role:     Role.ADMIN,
      isActive: true,
    },
  })

  // ── Partner ───────────────────────────────────────────────────────────────
  const partnerPw = await bcrypt.hash('Partner@123', 12)
  const partner = await prisma.user.upsert({
    where:  { email: 'partner@asifassociates.com' },
    update: {},
    create: {
      userCode: await generateUserCode(prisma, Role.PARTNER),
      email:    'partner@asifassociates.com',
      fullName: 'Asif Raza',
      password: partnerPw,
      role:     Role.PARTNER,
      isActive: true,
    },
  })

  // ── Manager ───────────────────────────────────────────────────────────────
  const managerPw = await bcrypt.hash('Manager@123', 12)
  const manager = await prisma.user.upsert({
    where:  { email: 'manager@asifassociates.com' },
    update: {},
    create: {
      userCode: await generateUserCode(prisma, Role.MANAGER),
      email:    'manager@asifassociates.com',
      fullName: 'Manager User',
      password: managerPw,
      role:     Role.MANAGER,
      isActive: true,
    },
  })

  // ── Trainee ───────────────────────────────────────────────────────────────
  const traineePw = await bcrypt.hash('Trainee@123', 12)
  const trainee = await prisma.user.upsert({
    where:  { email: 'trainee@asifassociates.com' },
    update: {},
    create: {
      userCode: await generateUserCode(prisma, Role.TRAINEE),
      email:    'trainee@asifassociates.com',
      fullName: 'Trainee User',
      password: traineePw,
      role:     Role.TRAINEE,
      isActive: true,
    },
  })

  // ── Client ────────────────────────────────────────────────────────────────
  const clientPw = await bcrypt.hash('Client@123', 12)
  const clientUser = await prisma.user.upsert({
    where:  { email: 'client@asifassociates.com' },
    update: {},
    create: {
      userCode: await generateUserCode(prisma, Role.CLIENT),
      email:    'client@asifassociates.com',
      fullName: 'Muhammad Bilal',
      password: clientPw,
      role:     Role.CLIENT,
      isActive: true,
      clientProfile: {
        create: {
          ntn:          '1234567-8',
          businessName: 'Bilal Traders',
          businessType: 'Sole Proprietor',
          city:         'Karachi',
          province:     'Sindh',
          traineeId:    trainee.id,
        },
      },
    },
  })

  // ── Attendance Settings ───────────────────────────────────────────────────
  const attSettings = [
    { key: 'reporting_time',       value: '09:00',        label: 'Reporting Time (HH:MM)'       },
    { key: 'grace_period_minutes', value: '15',           label: 'Late Grace Period (minutes)'  },
    { key: 'cutoff_time',          value: '17:00',        label: 'Attendance Cutoff Time'       },
    { key: 'auto_mark_on_login',   value: 'true',         label: 'Auto Mark Attendance on Login'},
    { key: 'timezone',             value: 'Asia/Karachi', label: 'Timezone'                     },
  ]
  for (const s of attSettings) {
    await prisma.attendanceSetting.upsert({
      where:  { key: s.key },
      update: {},
      create: s,
    })
  }

  // ── Profile Form Fields ───────────────────────────────────────────────────
  const profileFields: any[] = [
    // ── Personal Information (merged with Employment) ─────────────────────
    { fieldKey: 'fullName',      label: 'Display Name',    fieldType: 'text',   section: 'Personal Information', colSpan: 'half',  sortOrder: 1,  isCore: true,  placeholder: 'Full display name'  },
    { fieldKey: 'firstName',     label: 'First Name',      fieldType: 'text',   section: 'Personal Information', colSpan: 'third', sortOrder: 2,  isCore: false, placeholder: 'First'              },
    { fieldKey: 'midName',       label: 'Middle Name',     fieldType: 'text',   section: 'Personal Information', colSpan: 'third', sortOrder: 3,  isCore: false, placeholder: 'Middle'             },
    { fieldKey: 'lastName',      label: 'Last Name',       fieldType: 'text',   section: 'Personal Information', colSpan: 'third', sortOrder: 4,  isCore: false, placeholder: 'Last'               },
    { fieldKey: 'email',         label: 'Email',           fieldType: 'text',   section: 'Personal Information', colSpan: 'half',  sortOrder: 5,  isCore: false, placeholder: 'email@example.com'  },
    { fieldKey: 'phone',         label: 'Phone',           fieldType: 'text',   section: 'Personal Information', colSpan: 'half',  sortOrder: 6,  isCore: false, placeholder: '+92 3XX XXXXXXX'    },
    { fieldKey: 'dateOfBirth',   label: 'Date of Birth',   fieldType: 'date',   section: 'Personal Information', colSpan: 'third', sortOrder: 7,  isCore: false, placeholder: null                 },
    { fieldKey: 'employmentType', label: 'Type of Employment', fieldType: 'select', section: 'Personal Information', colSpan: 'third', sortOrder: 8, isCore: false, options: ['Employee', 'CA Trainee', 'Internee'] },
    { fieldKey: 'dateOfJoining', label: 'Date of Joining', fieldType: 'date',   section: 'Personal Information', colSpan: 'third', sortOrder: 9,  isCore: true,  placeholder: null                 },
    { fieldKey: 'department',    label: 'Department',      fieldType: 'select', section: 'Personal Information', colSpan: 'third', sortOrder: 10, isCore: false, options: ['Taxation', 'Audit and Assurance'] },
    { fieldKey: 'articlesType',  label: 'Articles Type',   fieldType: 'select', section: 'Personal Information', colSpan: 'third', sortOrder: 11, isCore: false, options: ['2.5 years', '3 years', '3.5 years'] },
    // ── CNIC & Address ────────────────────────────────────────────────────
    { fieldKey: 'cnic',             label: 'CNIC',             fieldType: 'text',     section: 'CNIC & Address', colSpan: 'half', sortOrder: 8,  isCore: false, placeholder: '00000-0000000-0'    },
    { fieldKey: 'permanentAddress', label: 'Permanent Address', fieldType: 'textarea', section: 'CNIC & Address', colSpan: 'full', sortOrder: 9,  isCore: false, placeholder: 'Permanent address', textareaRows: 3 },
    { fieldKey: 'currentAddress',   label: 'Current Address',   fieldType: 'textarea', section: 'CNIC & Address', colSpan: 'full', sortOrder: 10, isCore: false, placeholder: 'Current address',   textareaRows: 3 },
    // ── Banking Details ───────────────────────────────────────────────────
    { fieldKey: 'bank',          label: 'Bank',             fieldType: 'text', section: 'Banking Details', colSpan: 'half', sortOrder: 11, isCore: false, placeholder: 'e.g. HBL'             },
    { fieldKey: 'accountTitle',  label: 'Account Title',    fieldType: 'text', section: 'Banking Details', colSpan: 'half', sortOrder: 12, isCore: false, placeholder: 'Account holder name'   },
    { fieldKey: 'bankAccountNo', label: 'Bank Account No.', fieldType: 'text', section: 'Banking Details', colSpan: 'half', sortOrder: 13, isCore: false, placeholder: 'XXXX-XXXXXXXXX-X'      },
    { fieldKey: 'ibanNo',        label: 'IBAN No.',         fieldType: 'text', section: 'Banking Details', colSpan: 'half', sortOrder: 14, isCore: false, placeholder: 'PK36SCBL...'           },
  ]

  for (const f of profileFields) {
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
      update: data, create: data,
    })
  }

  // ── Client Form Fields ────────────────────────────────────────────────────
  const clientFields: any[] = [
    { fieldKey: 'businessName', label: 'Business Name',      fieldType: 'text',        section: 'Tax & Business',      colSpan: 'half',  sortOrder: 9,  isCore: false, isVisible: true,  placeholder: 'e.g. Bilal Traders' },
    { fieldKey: 'businessType', label: 'Business Type',      fieldType: 'select',      section: 'Tax & Business',      colSpan: 'half',  sortOrder: 10, isCore: false, isVisible: true,  options: ['Sole Proprietor','Partnership','Private Limited Company','Public Limited Company','NPO','NGO','Government Owned Entity','Other'] },
    { fieldKey: 'ntn',          label: 'NTN',                fieldType: 'text',        section: 'Tax & Business',      colSpan: 'half',  sortOrder: 11, isCore: false, isVisible: true,  placeholder: 'National Tax Number' },
    { fieldKey: 'strn',         label: 'STRN',               fieldType: 'text',        section: 'Tax & Business',      colSpan: 'half',  sortOrder: 12, isCore: false, isVisible: true,  placeholder: 'Sales Tax Reg. No.' },
    { fieldKey: 'traineeId',    label: 'Assigned Trainee',   fieldType: 'text',        section: 'Assignment',          colSpan: 'half',  sortOrder: 13, isCore: false, isVisible: true,  placeholder: '' },
  ]

  for (const f of clientFields) {
    const data: any = {
      formType: 'client', fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType,
      section: f.section, colSpan: f.colSpan, sortOrder: f.sortOrder, isCore: f.isCore,
      isVisible: f.isVisible, isRequired: false,
      placeholder: f.placeholder ?? null,
      textareaRows: f.textareaRows ?? 3,
    }
    if (f.options) data.options = f.options
    await prisma.formFieldSetting.upsert({
      where:  { formType_fieldKey: { formType: 'client', fieldKey: f.fieldKey } },
      update: data, create: data,
    })
  }

  console.log('✓ Seed complete')
  console.log(`  Admin:    ${admin.userCode}    admin@asifassociates.com   / Admin@123`)
  console.log(`  Partner:  ${partner.userCode}  partner@asifassociates.com / Partner@123`)
  console.log(`  Manager:  ${manager.userCode}  manager@asifassociates.com / Manager@123`)
  console.log(`  Trainee:  ${trainee.userCode}  trainee@asifassociates.com / Trainee@123`)
  console.log(`  Client:   ${clientUser.userCode}  client@asifassociates.com  / Client@123`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
