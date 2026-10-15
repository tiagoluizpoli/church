import {
  assignment,
  cycle,
  ministryParticipation,
  shiftRequirement,
} from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import {
  createSchedulePublishRecipe,
  type SchedulePublishJourney,
} from '@/seeds/e2e/recipes/schedule-publish';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
/** Past the legacy seed's last fixed date (2026-12-28). */
const LATE_ANCHOR: CalendarDay = parseCalendarDay({ value: '2027-03-01' });

interface LoadInput {
  anchor: CalendarDay;
}

async function load({ anchor }: LoadInput): Promise<SchedulePublishJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createSchedulePublishRecipe({ journeyKey: 'alpha', anchor }),
  });
}

describe('schedule-publish E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('starts both Ministries unpublished on one sent cycle, with nobody assigned', async () => {
    const journey = await load({ anchor: ANCHOR });

    const [cycleRow] = await testDb
      .select({ state: cycle.state })
      .from(cycle)
      .where(eq(cycle.id, journey.cycle.id));
    expect(cycleRow?.state).toBe('sent');

    const participations = await testDb
      .select({
        id: ministryParticipation.id,
        state: ministryParticipation.state,
      })
      .from(ministryParticipation)
      .where(eq(ministryParticipation.churchId, journey.church.id));
    expect(participations).toHaveLength(2);
    expect(participations.map(({ state }) => state)).toEqual([
      'availability_requested',
      'availability_requested',
    ]);
    expect(participations.map(({ id }) => id).sort()).toEqual(
      [journey.worship.id, journey.care.id].sort(),
    );

    expect(
      await testDb
        .select()
        .from(assignment)
        .where(eq(assignment.churchId, journey.church.id)),
    ).toEqual([]);
  });

  it('leaves two Usher seats open for a qualified persona and a qualified pool Volunteer', async () => {
    const journey = await load({ anchor: ANCHOR });

    const [requirement] = await testDb
      .select({
        peopleNeeded: shiftRequirement.peopleNeeded,
        roleId: shiftRequirement.roleId,
      })
      .from(shiftRequirement)
      .where(eq(shiftRequirement.participationId, journey.worship.id));
    expect(requirement).toEqual({
      peopleNeeded: journey.worship.peopleNeeded,
      roleId: journey.ministries.worship.roles.usher.id,
    });
    expect(journey.worship.peopleNeeded).toBe(2);
    expect(journey.personas.volunteer.name).not.toBe(journey.pool.other.name);
  });

  it('follows the anchor past the legacy seed dates', async () => {
    const journey = await load({ anchor: LATE_ANCHOR });

    // 14 days after the anchor at 09:00 Church-local (UTC-3, no DST).
    const eventDay = addCalendarDays({ day: LATE_ANCHOR, days: 14 });
    expect(journey.event.startsAt).toBe(`${eventDay}T12:00:00.000Z`);

    const [cycleRow] = await testDb
      .select({
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      })
      .from(cycle)
      .where(eq(cycle.id, journey.cycle.id));
    expect(cycleRow?.startDate.toISOString().slice(0, 10)).toBe(LATE_ANCHOR);
    expect(cycleRow?.endDate.toISOString().slice(0, 10)).toBe(
      addCalendarDays({ day: LATE_ANCHOR, days: 28 }),
    );
    expect(eventDay > LATE_ANCHOR).toBe(true);
  });

  it('restores the unpublished state when a published graph is reloaded', async () => {
    const journey = await load({ anchor: ANCHOR });
    await testDb
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.churchId, journey.church.id));

    const reloaded = await load({ anchor: ANCHOR });

    expect(reloaded).toEqual(journey);
    const states = await testDb
      .select({ state: ministryParticipation.state })
      .from(ministryParticipation)
      .where(eq(ministryParticipation.churchId, journey.church.id));
    expect(states.map(({ state }) => state)).toEqual([
      'availability_requested',
      'availability_requested',
    ]);
  });
});
