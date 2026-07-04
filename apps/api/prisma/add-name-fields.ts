import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const fields = [
    { fieldKey: 'firstName', label: 'First Name',  fieldType: 'text', section: 'Personal Information', colSpan: 'third', sortOrder: 2, isCore: false, placeholder: 'First'  },
    { fieldKey: 'midName',   label: 'Middle Name', fieldType: 'text', section: 'Personal Information', colSpan: 'third', sortOrder: 3, isCore: false, placeholder: 'Middle' },
    { fieldKey: 'lastName',  label: 'Last Name',   fieldType: 'text', section: 'Personal Information', colSpan: 'third', sortOrder: 4, isCore: false, placeholder: 'Last'   },
  ]

  // Shift existing fields down to make room
  await prisma.formFieldSetting.updateMany({
    where: { formType: 'user', sortOrder: { gte: 2 } },
    data:  { sortOrder: { increment: 3 } },
  })

  for (const f of fields) {
    const data: any = {
      formType: 'user', fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType,
      section: f.section, colSpan: f.colSpan, sortOrder: f.sortOrder, isCore: f.isCore,
      isVisible: true, isRequired: false, placeholder: f.placeholder, textareaRows: 3,
    }
    await prisma.formFieldSetting.upsert({
      where:  { formType_fieldKey: { formType: 'user', fieldKey: f.fieldKey } },
      update: data, create: data,
    })
  }

  console.log('First/Middle/Last name fields restored.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
