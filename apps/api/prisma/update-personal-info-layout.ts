import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Row 1: Display Name, Email, Phone, all third
  // Row 2: First, Middle, Last Name, all third
  // Row 3: DOB, DOJ, Department, all third
  // Row 4: Employment Type, Articles Type, (computed Remaining), all third
  const updates = [
    { fieldKey: 'fullName',      sortOrder: 1,  colSpan: 'third' },
    { fieldKey: 'email',         sortOrder: 2,  colSpan: 'third' },
    { fieldKey: 'phone',         sortOrder: 3,  colSpan: 'third' },
    { fieldKey: 'firstName',     sortOrder: 4,  colSpan: 'third' },
    { fieldKey: 'midName',       sortOrder: 5,  colSpan: 'third' },
    { fieldKey: 'lastName',      sortOrder: 6,  colSpan: 'third' },
    { fieldKey: 'dateOfBirth',   sortOrder: 7,  colSpan: 'third' },
    { fieldKey: 'dateOfJoining', sortOrder: 8,  colSpan: 'third' },
    { fieldKey: 'department',    sortOrder: 9,  colSpan: 'third' },
    { fieldKey: 'articlesType',  sortOrder: 11, colSpan: 'third' },
  ]

  for (const u of updates) {
    await prisma.formFieldSetting.update({
      where: { formType_fieldKey: { formType: 'user', fieldKey: u.fieldKey } },
      data:  { sortOrder: u.sortOrder, colSpan: u.colSpan },
    })
    console.log(`✓ ${u.fieldKey} → sortOrder ${u.sortOrder}, colSpan ${u.colSpan}`)
  }

  // Add employmentType between department (9) and articlesType (11)
  await prisma.formFieldSetting.upsert({
    where:  { formType_fieldKey: { formType: 'user', fieldKey: 'employmentType' } },
    update: {
      label: 'Type of Employment', fieldType: 'select', section: 'Personal Information',
      colSpan: 'third', sortOrder: 10, options: ['Employee', 'CA Trainee', 'Internee'],
      isVisible: true, isRequired: false, isCore: false,
    },
    create: {
      formType: 'user', fieldKey: 'employmentType', label: 'Type of Employment',
      fieldType: 'select', section: 'Personal Information', colSpan: 'third', sortOrder: 10,
      options: ['Employee', 'CA Trainee', 'Internee'],
      isVisible: true, isRequired: false, isCore: false, placeholder: null, textareaRows: 3,
    },
  })
  console.log('✓ employmentType field added/updated')
  console.log('Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
