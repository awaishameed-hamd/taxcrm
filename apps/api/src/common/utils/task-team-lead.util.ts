import { PrismaClient } from '@prisma/client'

// Every kind of work item (SalesTaxTask, Task, FbrCase) carries an optional
// teamLeadId saying which Team Lead approves it.
//
//   null  -> follow whoever the assignee's current team lead is. Auto-generated
//            tasks and anything created with the default pick land here, so
//            moving a trainee to another lead moves their work with them.
//   set   -> pinned to that lead no matter whose team the assignee is on.
//
// A value is stored only when the routing is deliberate: a Team Lead raising
// work for anyone (it has to come back to them, even for a trainee outside
// their team), or a creator picking a lead other than the assignee's own.
export async function resolveTaskTeamLead(
  prisma: PrismaClient,
  assigneeId: string | null | undefined,
  creatorId: string,
  creatorRole?: string,
  picked?: string | null,
): Promise<string | null> {
  if (creatorRole === 'TEAM_LEAD') return creatorId
  if (!picked) return null
  if (!assigneeId) return picked

  const assignee = await prisma.user.findUnique({
    where:  { id: assigneeId },
    select: { teamLeadId: true },
  })
  return assignee?.teamLeadId === picked ? null : picked
}

// Where-fragment for "work this Team Lead is responsible for": pinned to them,
// or unpinned and belonging to one of their own trainees. `relation` is the
// name of the assignee relation on the model being queried.
export function teamLeadOwnedFilter(userId: string, relation: 'trainee' | 'assignedTo'): { OR: any[] } {
  return {
    OR: [
      { teamLeadId: userId },
      { teamLeadId: null, [relation]: { teamLeadId: userId } },
    ],
  }
}
