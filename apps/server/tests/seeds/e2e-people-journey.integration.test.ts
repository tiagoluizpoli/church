import {
  member,
  ministryMembership,
  ministryMembershipRole,
  volunteer,
} from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensurePlatformOperator } from '@/scripts/ensure-platform-operator';
import { SEED_PLATFORM_OPERATOR_ID } from '@/seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import {
  createPeopleJourneyRecipe,
  type PeopleJourney,
} from '@/seeds/e2e/recipes/people-journey';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

interface LoadInput {
  journeyKey: string;
}

async function load({ journeyKey }: LoadInput): Promise<PeopleJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createPeopleJourneyRecipe({ journeyKey, anchor: ANCHOR }),
  });
}

interface MembershipOfInput {
  journey: PeopleJourney;
  userId: string;
}

async function membershipOf({ journey, userId }: MembershipOfInput) {
  const [row] = await testDb
    .select({
      id: ministryMembership.id,
      level: ministryMembership.ministryAccessLevel,
      status: ministryMembership.status,
    })
    .from(ministryMembership)
    .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
    .where(
      and(
        eq(volunteer.userId, userId),
        eq(ministryMembership.ministryId, journey.ministries.worship.id),
      ),
    );
  if (!row) return undefined;
  const roles = await testDb
    .select({ roleId: ministryMembershipRole.roleId })
    .from(ministryMembershipRole)
    .where(eq(ministryMembershipRole.ministryMembershipId, row.id));
  return { ...row, roleIds: roles.map(({ roleId }) => roleId) };
}

describe('people-journey E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({ db: testDb, id: SEED_PLATFORM_OPERATOR_ID });
  });

  it('seeds the accepted leader and Volunteer J4 leaves behind, with one Role still to add', async () => {
    const journey = await load({ journeyKey: 'alpha' });
    const { worship } = journey.ministries;

    expect(
      await membershipOf({ journey, userId: journey.personas.leader.userId }),
    ).toMatchObject({ level: 'leader', status: 'active', roleIds: [] });
    expect(
      await membershipOf({
        journey,
        userId: journey.personas.volunteer.userId,
      }),
    ).toMatchObject({
      level: 'volunteer',
      status: 'active',
      roleIds: [worship.roles.vocals.id],
    });
    const [leaderAccess] = await testDb
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, journey.church.id),
          eq(member.userId, journey.personas.leader.userId),
        ),
      );
    expect(leaderAccess?.role).toBe('member');
  });

  it('gives each journey key its own Church, and a retry the same one', async () => {
    const first = await load({ journeyKey: 'alpha' });
    const other = await load({ journeyKey: 'beta' });
    const retry = await load({ journeyKey: 'alpha' });

    expect(other.church.id).not.toBe(first.church.id);
    expect(retry.church.id).toBe(first.church.id);
    expect(retry.personas.volunteer.email).toBe(first.personas.volunteer.email);
  });
});
