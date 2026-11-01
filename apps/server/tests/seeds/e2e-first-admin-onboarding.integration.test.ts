import { invitation, member, user } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensurePlatformOperator } from '@/scripts/ensure-platform-operator';
import { SEED_PLATFORM_OPERATOR_ID } from '@/seeds/blueprints/credentials';
import { buildUser } from '@/seeds/builders/identity';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import {
  createFirstAdminOnboardingRecipe,
  type FirstAdminOnboardingJourney,
} from '@/seeds/e2e/recipes/first-admin-onboarding';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

interface LoadInput {
  journeyKey: string;
}

async function load({
  journeyKey,
}: LoadInput): Promise<FirstAdminOnboardingJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createFirstAdminOnboardingRecipe({ journeyKey, anchor: ANCHOR }),
  });
}

describe('first-admin-onboarding E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({ db: testDb, id: SEED_PLATFORM_OPERATOR_ID });
  });

  it('starts from a provisioned Church whose first-admin invitation is unredeemed', async () => {
    const journey = await load({ journeyKey: 'alpha' });

    expect(journey.redemptionPath).toBe(
      `/invitations/church/${journey.invitationId}`,
    );
    const [pending] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, journey.invitationId));
    expect(pending).toMatchObject({
      organizationId: journey.church.id,
      email: journey.adminEmail,
      role: 'admin',
      status: 'pending',
      inviterId: SEED_PLATFORM_OPERATOR_ID,
    });
    expect(
      await testDb
        .select()
        .from(member)
        .where(eq(member.organizationId, journey.church.id)),
    ).toEqual([]);
    expect(
      await testDb
        .select()
        .from(user)
        .where(eq(user.email, journey.adminEmail)),
    ).toEqual([]);
  });

  it('pins its ids per journey key and gives each key its own Church', async () => {
    const alpha = await load({ journeyKey: 'alpha' });
    const beta = await load({ journeyKey: 'beta' });

    expect(beta.church.id).not.toBe(alpha.church.id);
    expect(beta.adminEmail).not.toBe(alpha.adminEmail);
    expect((await load({ journeyKey: 'alpha' })).invitationId).toBe(
      alpha.invitationId,
    );
  });

  it('lets a retry join again by dropping the admin an earlier attempt created', async () => {
    const first = await load({ journeyKey: 'alpha' });
    await buildUser({
      db: testDb,
      id: crypto.randomUUID(),
      name: 'Joined Earlier',
      email: first.adminEmail,
    });

    const retry = await load({ journeyKey: 'alpha' });

    expect(
      await testDb.select().from(user).where(eq(user.email, retry.adminEmail)),
    ).toEqual([]);
    const [pending] = await testDb
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.id, retry.invitationId));
    expect(pending?.status).toBe('pending');
  });
});
