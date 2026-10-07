import { member, ministry } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  type CrossTenantInvitationJourney,
  createCrossTenantInvitationRecipe,
} from '../../seeds/e2e/recipes/cross-tenant-invitation';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

interface LoadInput {
  journeyKey: string;
}

async function load({
  journeyKey,
}: LoadInput): Promise<CrossTenantInvitationJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createCrossTenantInvitationRecipe({ journeyKey, anchor: ANCHOR }),
  });
}

describe('cross-tenant-invitation E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({ db: testDb, id: SEED_PLATFORM_OPERATOR_ID });
  });

  it('builds two Churches that each hold only their own admin and Ministry', async () => {
    const { churchA, churchB } = await load({ journeyKey: 'alpha' });

    for (const [own, other] of [
      [churchA, churchB],
      [churchB, churchA],
    ] as const) {
      const members = await testDb
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, own.church.id));
      expect(members).toEqual([{ userId: own.personas.admin.userId }]);
      const ministries = await testDb
        .select({ id: ministry.id })
        .from(ministry)
        .where(eq(ministry.churchId, own.church.id));
      expect(ministries).toEqual([{ id: own.ministries.worship.id }]);
      expect(own.ministries.worship.id).not.toBe(other.ministries.worship.id);
    }
  });

  it('names no Church A value inside any Church B name, slug or Ministry name', async () => {
    const { churchA, churchB } = await load({ journeyKey: 'alpha' });

    const churchBValues = [
      churchB.church.name,
      churchB.church.slug,
      churchB.ministries.worship.name,
    ];
    for (const value of churchBValues) {
      expect(value).not.toContain(churchA.church.slug);
      expect(value).not.toContain(churchA.church.name);
      expect(value).not.toContain(churchA.ministries.worship.name);
    }
    expect(churchA.church.name).not.toContain(churchB.church.name);
    expect(churchA.church.slug).not.toContain(churchB.church.slug);
  });

  it('derives the invited emails from the journey, so two keys never share one', async () => {
    const alpha = await load({ journeyKey: 'alpha' });
    const beta = await load({ journeyKey: 'beta' });

    expect(alpha.emails.probe).not.toBe(alpha.emails.target);
    expect(alpha.emails.probe).not.toBe(beta.emails.probe);
    expect(alpha.emails.target).not.toBe(beta.emails.target);
    expect(alpha.emails.probe).toMatch(/@[0-9a-f]{12}\.e2e\.test$/);
  });
});
