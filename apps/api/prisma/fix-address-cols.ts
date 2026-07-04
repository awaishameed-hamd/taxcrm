import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  await p.formFieldSetting.update({ where: { formType_fieldKey: { formType: 'user', fieldKey: 'permanentAddress' } }, data: { textareaRows: 1 } })
  await p.formFieldSetting.update({ where: { formType_fieldKey: { formType: 'user', fieldKey: 'currentAddress'   } }, data: { textareaRows: 1 } })
  console.log('Done')
}
main().catch(console.error).finally(() => p.$disconnect())
