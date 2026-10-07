import { randomUUID } from 'node:crypto';
import { account, addChurchMember, member, user, volunteer } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { verifyPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../seeds/builders/volunteer';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  createMinistryRedemptionRecipe,
  type MinistryRedemptionJourney,
} from '../../seeds/e2e/recipes/ministry-redemption';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';
import { snapshotAllRows } from './journey-graph-snapshot';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

interface LoadInput {
  journeyKey: string;
}

async function load({
  journeyKey,
}: LoadInput): Promise<MinistryRedemptionJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createMinistryRedemptionRecipe({ journeyKey, anchor: ANCHOR }),
  });
}

describe('ministry-redemption E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({ db: testDb, id: SEED_PLATFORM_OPERATOR_ID });
  });

  it('gives Church A a Church Member with no Volunteer profile and no Ministry Membership', async () => {
    const journey = await load({ journeyKey: 'alpha' });

    const memberships = await testDb
      .select({
        churchId: member.organizationId,
        accessLevel: member.role,
      })
      .from(member)
      .where(eq(member.userId, journey.memberOnly.userId));
    expect(memberships).toEqual([
      { churchId: journey.churchA.church.id, accessLevel: 'member' },
    ]);
    expect(
      await testDb
        .select({ id: volunteer.id })
        .from(volunteer)
        .where(eq(volunteer.userId, journey.memberOnly.userId)),
    ).toEqual([]);
  });

  it('signs the Member in with the persona password', async () => {
    const journey = await load({ journeyKey: 'alpha' });
    const { memberOnly } = journey;

    expect(memberOnly.email.endsWith('.e2e.test')).toBe(true);
    expect(
      memberOnly.email.endsWith(
        journey.churchA.personas.admin.email.split('@')[1] ?? 'missing',
      ),
    ).toBe(true);
    expect(await volunteerCount({ userId: memberOnly.userId })).toBe(0);
    expect(
      await verifyPassword({
        hash: await storedPasswordHash({ userId: memberOnly.userId }),
        password: memberOnly.password,
      }),
    ).toBe(true);
  });

  it('keeps Church B a separate tenant with only its own admin', async () => {
    const journey = await load({ journeyKey: 'alpha' });

    const churchBMembers = await testDb
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, journey.churchB.church.id));
    expect(churchBMembers).toEqual([
      { userId: journey.churchB.personas.admin.userId },
    ]);
    expect(journey.churchB.church.id).not.toBe(journey.churchA.church.id);
    expect(Object.keys(journey.churchB.ministries)).toEqual([]);
  });

  it('recreates its starting graph over one the redemptions already ran on', async () => {
    const journey = await load({ journeyKey: 'alpha' });
    const fresh = await snapshotAllRows();
    const { worship } = journey.churchA.ministries;
    const churchAId = journey.churchA.church.id;

    // What the redemptions do through the product: the existing Member gains
    // a Volunteer profile and Ministry Membership, and the outsider is created
    // with a Church Membership, a Volunteer profile and the same Ministry.
    const outsiderId = randomUUID();
    await testDb.insert(user).values({
      id: outsiderId,
      name: 'Outsider',
      email: `outsider-${outsiderId}@example.test`,
      emailVerified: true,
    });
    await addChurchMember({
      db: testDb,
      churchId: churchAId,
      userId: outsiderId,
      accessLevel: 'member',
      id: randomUUID(),
    });
    for (const userId of [journey.memberOnly.userId, outsiderId]) {
      const redeemed = await buildVolunteer({
        db: testDb,
        churchId: churchAId,
        userId,
        id: randomUUID(),
      });
      await buildMinistryMembership({
        db: testDb,
        churchId: churchAId,
        volunteerId: redeemed.id,
        ministryId: worship.id,
        id: randomUUID(),
        ministryAccessLevel: 'volunteer',
        roleIds: [worship.roles.usher.id],
        teams: [],
      });
    }

    const reloaded = await load({ journeyKey: 'alpha' });

    expect(reloaded).toEqual(journey);
    // The outsider's `user` row is outside the recipe's roots, so it stays;
    // every other table, and every recipe-owned `user` row, must be identical.
    const { user: freshUsers = [], ...freshRest } = fresh;
    const { user: reloadedUsers = [], ...reloadedRest } =
      await snapshotAllRows();
    expect(reloadedRest).toEqual(freshRest);
    expect(reloadedUsers).toEqual(expect.arrayContaining(freshUsers));
    expect(reloadedUsers).toHaveLength(freshUsers.length + 1);
  });

  it('gives two journey keys disjoint Churches, Users and emails', async () => {
    const alpha = await load({ journeyKey: 'alpha' });
    const beta = await load({ journeyKey: 'beta' });

    expect(alpha.churchA.church.id).not.toBe(beta.churchA.church.id);
    expect(alpha.churchA.church.slug).not.toBe(beta.churchA.church.slug);
    expect(alpha.memberOnly.userId).not.toBe(beta.memberOnly.userId);
    expect(alpha.memberOnly.email).not.toBe(beta.memberOnly.email);
    expect(alpha.churchA.personas.admin.email).not.toBe(
      beta.churchA.personas.admin.email,
    );
  });
});

interface UserIdInput {
  userId: string;
}

async function volunteerCount({ userId }: UserIdInput): Promise<number> {
  const rows = await testDb
    .select({ id: volunteer.id })
    .from(volunteer)
    .where(eq(volunteer.userId, userId));
  return rows.length;
}

async function storedPasswordHash({ userId }: UserIdInput): Promise<string> {
  const [row] = await testDb
    .select({ password: account.password })
    .from(account)
    .where(eq(account.userId, userId));
  if (row?.password == null) {
    throw new Error(`No credential account for ${userId}.`);
  }
  return row.password;
}
