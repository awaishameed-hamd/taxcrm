import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaClient, Role } from '@prisma/client'

// Throws if the actor is not allowed to see/act on this client's data.
// ADMIN / PARTNER / MANAGER: unrestricted (firm-wide visibility).
// TEAM_LEAD: only their own clients or clients assigned to their trainees.
// TRAINEE: only clients assigned directly to them.
export async function assertClientAccess(
  prisma: PrismaClient,
  clientId: string,
  actorId: string,
  actorRole: Role | string,
) {
  if (actorRole === Role.ADMIN || actorRole === Role.PARTNER || actorRole === Role.MANAGER) return

  const client = await prisma.clientProfile.findUnique({
    where:  { id: clientId },
    select: { traineeId: true, trainee: { select: { teamLeadId: true } } },
  })
  if (!client) throw new NotFoundException('Client not found')

  if (actorRole === Role.TEAM_LEAD) {
    if (client.traineeId === actorId || client.trainee?.teamLeadId === actorId) return
    throw new ForbiddenException('Access denied')
  }

  if (actorRole === Role.TRAINEE) {
    if (client.traineeId === actorId) return
    throw new ForbiddenException('Access denied')
  }

  throw new ForbiddenException('Access denied')
}
