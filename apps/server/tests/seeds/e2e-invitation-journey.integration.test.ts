import { invitation, user } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { and, eq, inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensurePlatformOperator } from '@/scripts/ensure-platform-operator';
import { SEED_PLATFORM_OPERATOR_ID } from '@/seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import {
  createInvitationJourneyRecipe,
  type InvitationJourney,
} from '@/seeds/e2e/recipes/invitation-journey';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

interface LoadInput {
  journeyKey: string;
}

async function load({ journeyKey }: LoadInput): Promise<InvitationJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createInvitationJourneyRecipe({ journeyKey, anchor: ANCHOR }),
  });
}

describe('invitation-journey E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({ db: testDb, id: SEED_PLATFORM_OPERATOR_ID });
  });

  it('seeds a Ministry with Roles and an admin, but no pending invitation or invitee User', async () => {
    const journey = await load({ journeyKey: 'alpha' });

    expect(Object.keys(journey.ministries.worship.roles).sort()).toEqual([
      'greeter',
      'usher',
    ]);
    expect(journey.leaderEmail).not.toBe(journey.volunteerEmail);
    expect(
      await testDb
        .select({ id: invitation.id })
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, journey.church.id),
            eq(invitation.status, 'pending'),
          ),
        ),
    ).toEqual([]);
    expect(
      await testDb
        .select({ id: user.id })
        .from(user)
        .where(
          inArray(user.email, [journey.leaderEmail, journey.volunteerEmail]),
        ),
    ).toEqual([]);
  });

  it('gives each journey key its own addresses, and a retry the same ones', async () => {
    const first = await load({ journeyKey: 'alpha' });
    const other = await load({ journeyKey: 'beta' });
    const retry = await load({ journeyKey: 'alpha' });

    expect(other.leaderEmail).not.toBe(first.leaderEmail);
    expect(retry.leaderEmail).toBe(first.leaderEmail);
    expect(retry.volunteerEmail).toBe(first.volunteerEmail);
  });
});
