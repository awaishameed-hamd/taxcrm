import { PrismaClient, Role } from '@prisma/client'

const PREFIX: Record<Role, string> = {
  ADMIN:     'A',
  PARTNER:   'P',
  MANAGER:   'M',
  TEAM_LEAD: 'L',
  TRAINEE:   'T',
  CLIENT:         'C',
  REPRESENTATIVE: 'R',
}

const PAD_LENGTH: Record<Role, number> = {
  ADMIN:          3,
  PARTNER:        3,
  MANAGER:        3,
  TEAM_LEAD:      3,
  TRAINEE:        3,
  CLIENT:         7,
  REPRESENTATIVE: 4,
}

// Atomically reserves the next sequence number for a role and formats it
// into a permanent userCode (P001, M001, T001, C-0000001). The upsert below
// is a single statement in Postgres, so concurrent calls cannot collide.
export async function generateUserCode(prisma: PrismaClient, role: Role): Promise<string> {
  const key = `userCode:${role}`

  const counter = await prisma.sequenceCounter.upsert({
    where:  { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  })

  const num = String(counter.value).padStart(PAD_LENGTH[role], '0')
  return role === Role.CLIENT ? `${PREFIX[role]}-${num}` : `${PREFIX[role]}${num}`
}
