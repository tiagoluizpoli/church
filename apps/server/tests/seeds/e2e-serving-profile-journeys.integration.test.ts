import {
  event,
  ministry,
  ministryVolunteer,
  ministryVolunteerTeam,
  planningCycle,
} from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PLATFORM_OPERATOR_ID } from '../../seeds/blueprints/credentials';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import { createLeaderTailoringRecipe } from '../../seeds/e2e/recipes/leader-tailoring';
import { createLiveChangesRecipe } from '../../seeds/e2e/recipes/live-changes';
import { createVolunteerAvailabilityRecipe } from '../../seeds/e2e/recipes/volunteer-availability';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';
import { qualifiedRoleIds, type VolunteerIdInput } from './qualified-role-ids';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
/** After the legacy seed's last fixed date (2026-12-28). */
const LATE_ANCHOR: CalendarDay = parseCalendarDay({ value: '2027-03-01' });

interface AnchorInput {
  anchor: CalendarDay;
}

interface JourneyKeyInput extends AnchorInput {
  journeyKey: string;
}

interface ChurchIdInput {
  churchId: string;
}

async function ministryNames({ churchId }: ChurchIdInput): Promise<string[]> {
  const rows = await testDb
    .select({ name: ministry.name })
    .from(ministry)
    .where(eq(ministry.churchId, churchId));
  return rows.map((row) => row.name).sort();
}

async function datedRowCounts({ churchId }: ChurchIdInput): Promise<number[]> {
  const cycles = await testDb
    .select({ id: planningCycle.id })
    .from(planningCycle)
    .where(eq(planningCycle.churchId, churchId));
  const events = await testDb
    .select({ id: event.id })
    .from(event)
    .where(eq(event.churchId, churchId));
  return [cycles.length, events.length];
}

async function ministryAccessLevels({
  volunteerId,
}: VolunteerIdInput): Promise<Record<string, string>> {
  const rows = await testDb
    .select({
      ministryId: ministryVolunteer.ministryId,
      accessLevel: ministryVolunteer.ministryAccessLevel,
    })
    .from(ministryVolunteer)
    .where(eq(ministryVolunteer.volunteerId, volunteerId));
  return Object.fromEntries(
    rows.map((row) => [row.ministryId, row.accessLevel]),
  );
}

async function loadAvailability({ journeyKey, anchor }: JourneyKeyInput) {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createVolunteerAvailabilityRecipe({ journeyKey, anchor }),
  });
}

async function loadLeaderTailoring({ journeyKey, anchor }: JourneyKeyInput) {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createLeaderTailoringRecipe({ journeyKey, anchor }),
  });
}

async function loadLiveChanges({ journeyKey, anchor }: JourneyKeyInput) {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createLiveChangesRecipe({ journeyKey, anchor }),
  });
}

describe('serving-profile journey recipes (#329 cluster B)', () => {
  beforeEach(async () => {
    await truncateAll();
    await ensurePlatformOperator({
      db: testDb,
      id: SEED_PLATFORM_OPERATOR_ID,
    });
  });

  it('leader-tailoring gives the leader its own Ministry and roles, nothing dated', async () => {
    const journey = await loadLeaderTailoring({
      journeyKey: 'alpha',
      anchor: ANCHOR,
    });

    expect(await ministryNames({ churchId: journey.church.id })).toEqual([
      'Louvor',
    ]);
    expect(
      await ministryAccessLevels({
        volunteerId: journey.personas.leader.volunteerId,
      }),
    ).toEqual({ [journey.ministries.worship.id]: 'leader' });
    expect(Object.keys(journey.ministries.worship.roles)).toEqual(['usher']);
    expect(await datedRowCounts({ churchId: journey.church.id })).toEqual([
      0, 0,
    ]);
  });

  it('volunteer-availability puts the leader in both Ministries and the TeamLeader in Worship alone', async () => {
    const journey = await loadAvailability({
      journeyKey: 'alpha',
      anchor: ANCHOR,
    });
    const { worship, care } = journey.ministries;

    expect(await ministryNames({ churchId: journey.church.id })).toEqual([
      'Cuidado',
      'Louvor',
    ]);
    expect(
      await ministryAccessLevels({
        volunteerId: journey.personas.leader.volunteerId,
      }),
    ).toEqual({ [worship.id]: 'leader', [care.id]: 'volunteer' });
    expect(
      await qualifiedRoleIds({
        volunteerId: journey.personas.leader.volunteerId,
      }),
    ).toEqual([worship.roles.usher.id, care.roles.careHost.id].sort());
    expect(
      await ministryAccessLevels({
        volunteerId: journey.personas.teamLeader.volunteerId,
      }),
    ).toEqual({ [worship.id]: 'volunteer' });

    const teamLeaderTeams = await testDb
      .select({
        teamId: ministryVolunteerTeam.teamId,
        accessLevel: ministryVolunteerTeam.accessLevel,
      })
      .from(ministryVolunteerTeam)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, ministryVolunteerTeam.ministryVolunteerId),
      )
      .where(
        eq(
          ministryVolunteer.volunteerId,
          journey.personas.teamLeader.volunteerId,
        ),
      );
    expect(teamLeaderTeams).toEqual([
      { teamId: worship.teams.alpha.id, accessLevel: 'leader' },
    ]);
  });

  it('live-changes qualifies the owner and the TeamLeader for Usher and keeps the leader unrostered', async () => {
    const journey = await loadLiveChanges({
      journeyKey: 'alpha',
      anchor: ANCHOR,
    });
    const usherId = journey.ministries.worship.roles.usher.id;

    expect(
      await qualifiedRoleIds({
        volunteerId: journey.personas.owner.volunteerId,
      }),
    ).toEqual([usherId]);
    expect(
      await qualifiedRoleIds({
        volunteerId: journey.personas.teamLeader.volunteerId,
      }),
    ).toEqual([usherId]);
    expect(
      await qualifiedRoleIds({
        volunteerId: journey.personas.leader.volunteerId,
      }),
    ).toEqual([]);
    expect(
      new Set(Object.values(journey.personas).map((persona) => persona.name))
        .size,
    ).toBe(3);
  });

  it('keeps two keys on separate Ministries, so no serving profile is shared', async () => {
    const alpha = await loadLiveChanges({
      journeyKey: 'alpha',
      anchor: ANCHOR,
    });
    const beta = await loadLiveChanges({ journeyKey: 'beta', anchor: ANCHOR });

    expect(alpha.ministries.worship.id).not.toBe(beta.ministries.worship.id);
    expect(alpha.church.id).not.toBe(beta.church.id);
  });

  it.each([
    ['leader-tailoring', loadLeaderTailoring],
    ['volunteer-availability', loadAvailability],
    ['live-changes', loadLiveChanges],
  ] as const)('%s: every date follows the anchor, also after the legacy seed dates', async (_name, load) => {
    const early = await load({ journeyKey: 'alpha', anchor: ANCHOR });
    expect(early.anchor).toBe('2026-03-15');
    expect(early.cycleWindow).toEqual({
      startDate: '2026-03-20',
      endDate: '2026-04-17',
    });

    const late = await load({ journeyKey: 'beta', anchor: LATE_ANCHOR });
    expect(late.anchor).toBe('2027-03-01');
    expect(late.cycleWindow).toEqual({
      startDate: '2027-03-06',
      endDate: '2027-04-03',
    });
    expect(await datedRowCounts({ churchId: late.church.id })).toEqual([0, 0]);
  });

  it.each([
    ['a Saturday', '2026-03-14'],
    ['a Sunday', '2026-03-15'],
  ] as const)('the cycle window anchored on %s holds at least four Sundays', async (_label, day) => {
    const journey = await loadAvailability({
      journeyKey: 'alpha',
      anchor: parseCalendarDay({ value: day }),
    });
    let sundays = 0;
    for (
      let cursor = new Date(`${journey.cycleWindow.startDate}T00:00:00Z`);
      cursor < new Date(`${journey.cycleWindow.endDate}T00:00:00Z`);
      cursor = new Date(cursor.getTime() + 86_400_000)
    ) {
      if (cursor.getUTCDay() === 0) sundays += 1;
    }
    expect(sundays).toBeGreaterThanOrEqual(4);
  });
});
