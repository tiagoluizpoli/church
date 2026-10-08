import 'reflect-metadata';
import { account, member, ministryVolunteer, volunteer } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { verifyPassword } from 'better-auth/crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  createSharedPersonasRecipe,
  type SharedPersonas,
} from '../../seeds/e2e/recipes/shared-personas';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';
import { qualifiedRoleIds } from './qualified-role-ids';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

async function loadSharedPersonas(): Promise<SharedPersonas> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createSharedPersonasRecipe({ journeyKey: 'suite', anchor: ANCHOR }),
  });
}

interface UserIdInput {
  userId: string;
}

async function churchRoleOf({ userId }: UserIdInput): Promise<string[]> {
  const rows = await testDb
    .select({ role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  return rows.map((row) => row.role);
}

interface SignsInInput extends UserIdInput {
  password: string;
}

async function signsInWith({
  userId,
  password,
}: SignsInInput): Promise<boolean> {
  const [credential] = await testDb
    .select({ hash: account.password })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, 'credential')),
    );
  if (!credential?.hash) return false;
  return await verifyPassword({ hash: credential.hash, password });
}

describe('E2E shared personas recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('provisions the Platform Operator every journey Church is provisioned by', async () => {
    await loadSharedPersonas();

    const operator = await ensurePlatformOperator({ db: testDb });
    expect(operator.id).toBe(SEED_PLATFORM_OPERATOR_ID);
  });

  it('seats a ChurchAdmin and a Volunteer of one Church, both able to sign in', async () => {
    const { church, personas } = await loadSharedPersonas();

    expect(await churchRoleOf({ userId: personas.churchAdmin.userId })).toEqual(
      ['admin'],
    );
    expect(await churchRoleOf({ userId: personas.volunteer.userId })).toEqual([
      'member',
    ]);
    for (const persona of [personas.churchAdmin, personas.volunteer]) {
      expect(
        await signsInWith({
          userId: persona.userId,
          password: persona.password,
        }),
      ).toBe(true);
    }

    const [activeVolunteer] = await testDb
      .select({ id: volunteer.id, churchId: volunteer.churchId })
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, personas.volunteer.userId),
          isNull(volunteer.leftAt),
        ),
      );
    expect(activeVolunteer).toEqual({
      id: personas.volunteer.volunteerId,
      churchId: church.id,
    });
    const memberships = await testDb
      .select({ accessLevel: ministryVolunteer.ministryAccessLevel })
      .from(ministryVolunteer)
      .where(eq(ministryVolunteer.volunteerId, activeVolunteer?.id ?? ''));
    expect(memberships).toEqual([{ accessLevel: 'volunteer' }]);
    expect(
      await qualifiedRoleIds({ volunteerId: personas.volunteer.volunteerId }),
    ).toHaveLength(1);
  });
});
