import { ministry, ministryVolunteer } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { appRouter } from '../../../src/routers';
import { testDb } from '../repositories/setup';

/**
 * Stable seed IDs (mirrors `tests/integration/repositories/setup.ts`).
 * Centralised so router integration suites don't re-declare magic strings.
 */
export const SEED = {
  church: '11111111-1111-1111-1111-111111111111',
  ministryAdult: '33333333-3333-3333-3333-333333333331',
  ministryYouth: '33333333-3333-3333-3333-333333333332',
  userAlice: '22222222-2222-2222-2222-222222222221',
  userBob: '22222222-2222-2222-2222-222222222222',
  volunteerAlice: '44444444-4444-4444-4444-444444444441',
  volunteerBob: '44444444-4444-4444-4444-444444444442',
  roleUsher: '55555555-5555-5555-5555-555555555551',
  roleGreeter: '55555555-5555-5555-5555-555555555552',
  eventDraft: '66666666-6666-6666-6666-666666666661',
  eventPublished: '66666666-6666-6666-6666-666666666662',
  slotDraft: '77777777-7777-7777-7777-777777777771',
  slotPublished: '77777777-7777-7777-7777-777777777772',
  requirementUsher: '88888888-8888-8888-8888-888888888881',
  assignmentConfirmed: '99999999-9999-9999-9999-999999999991',
  assignmentDeclined: '99999999-9999-9999-9999-999999999992',
} as const;

export type AppCaller = ReturnType<typeof appRouter.createCaller>;

/** Build a tRPC caller with a mocked authenticated session for `userId`. */
export function createCaller(userId: string): AppCaller {
  return appRouter.createCaller({
    session: {
      user: {
        id: userId,
        name: 'Test User',
        email: 'test@user.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: 'sess-1',
        userId,
        token: 'tok-1',
        expiresAt: new Date(Date.now() + 3_600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    auth: null,
  });
}

/** A caller with no session — exercises the protected-procedure guard. */
export function createAnonCaller(): AppCaller {
  return appRouter.createCaller({ session: null, auth: null });
}

/** Promote a volunteer to leader of a ministry (seed members are volunteers). */
export async function promoteToLeader(
  volunteerId: string,
  ministryId: string,
): Promise<void> {
  await testDb
    .update(ministryVolunteer)
    .set({ systemRole: 'leader' })
    .where(
      and(
        eq(ministryVolunteer.volunteerId, volunteerId),
        eq(ministryVolunteer.ministryId, ministryId),
      ),
    );
}

/** Promote a volunteer to sub-leader of a ministry, optionally on a team. */
export async function promoteToSubLeader(
  volunteerId: string,
  ministryId: string,
  teamId: string | null,
): Promise<void> {
  await testDb
    .update(ministryVolunteer)
    .set({ systemRole: 'sub_leader', teamId })
    .where(
      and(
        eq(ministryVolunteer.volunteerId, volunteerId),
        eq(ministryVolunteer.ministryId, ministryId),
      ),
    );
}

/** Create an Administration ministry and make the volunteer its leader. */
export async function promoteToAdmin(volunteerId: string): Promise<void> {
  const adminMinistryId = '33333333-3333-3333-3333-333333333339';
  await testDb
    .insert(ministry)
    .values({
      id: adminMinistryId,
      churchId: SEED.church,
      name: 'Administration',
      enforcementType: 'soft',
    })
    .onConflictDoNothing();
  await testDb
    .insert(ministryVolunteer)
    .values({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccca9',
      churchId: SEED.church,
      volunteerId,
      ministryId: adminMinistryId,
      systemRole: 'leader',
      status: 'active',
    })
    .onConflictDoNothing();
}
