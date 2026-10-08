import { member, planningCycle } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import { createMinistryWorkspaceIndexRecipe } from '../../seeds/e2e/recipes/ministry-workspace-index';
import { createPlanningAdminRecipe } from '../../seeds/e2e/recipes/planning-admin';
import { createPlanningCycleAccessRecipe } from '../../seeds/e2e/recipes/planning-cycle-access';
import { createPlanningCycleTenantsRecipe } from '../../seeds/e2e/recipes/planning-cycle-tenants';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-12-28' });

interface ChurchIdInput {
  churchId: string;
}

async function cyclesOf({ churchId }: ChurchIdInput) {
  return await testDb
    .select({
      name: planningCycle.name,
      state: planningCycle.state,
    })
    .from(planningCycle)
    .where(eq(planningCycle.churchId, churchId));
}

async function accessLevelsOf({ churchId }: ChurchIdInput) {
  const rows = await testDb
    .select({ accessLevel: member.role })
    .from(member)
    .where(eq(member.organizationId, churchId));
  return rows.map((row) => row.accessLevel).sort();
}

describe('planning journey recipes (#329 planning cluster)', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({
      db: testDb,
      id: SEED_PLATFORM_OPERATOR_ID,
    });
  });

  it('planning-admin holds an admin and a Volunteer but no cycle, with a window after the anchor', async () => {
    const journey = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createPlanningAdminRecipe({
        journeyKey: 'alpha',
        anchor: ANCHOR,
      }),
    });

    expect(await cyclesOf({ churchId: journey.church.id })).toEqual([]);
    expect(await accessLevelsOf({ churchId: journey.church.id })).toEqual([
      'admin',
      'member',
    ]);
    expect(journey.cycleWindow).toEqual({
      startDate: '2027-01-02',
      endDate: '2027-01-30',
    });
  });

  it('planning-cycle-access adds one locked cycle inside the window', async () => {
    const journey = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createPlanningCycleAccessRecipe({
        journeyKey: 'alpha',
        anchor: ANCHOR,
      }),
    });

    expect(await cyclesOf({ churchId: journey.church.id })).toEqual([
      { name: journey.cycle.name, state: 'locked' },
    ]);
  });

  it('planning-cycle-tenants gives each Church only its own draft cycle', async () => {
    const journey = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createPlanningCycleTenantsRecipe({
        journeyKey: 'alpha',
        anchor: ANCHOR,
      }),
    });

    expect(await cyclesOf({ churchId: journey.churchA.church.id })).toEqual([
      { name: journey.churchA.cycle.name, state: 'draft' },
    ]);
    expect(await cyclesOf({ churchId: journey.churchB.church.id })).toEqual([
      { name: journey.churchB.cycle.name, state: 'draft' },
    ]);
    expect(journey.churchA.cycle.name).not.toContain(
      journey.churchB.cycle.name,
    );
    expect(journey.churchB.cycle.name).not.toContain(
      journey.churchA.cycle.name,
    );
  });

  it('ministry-workspace-index has two Ministries and a leader of one only', async () => {
    const journey = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createMinistryWorkspaceIndexRecipe({
        journeyKey: 'alpha',
        anchor: ANCHOR,
      }),
    });

    expect(journey.ministries.worship.name).toBe('Louvor');
    expect(journey.ministries.care.name).toBe('Cuidado');
    expect(await accessLevelsOf({ churchId: journey.church.id })).toEqual([
      'admin',
      'member',
    ]);
  });
});
