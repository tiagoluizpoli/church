import {
  assignment,
  cycle,
  event,
  eventTimeBlock,
  ministryParticipation,
  shift,
} from '@church/db';
import {
  type CalendarDay,
  parseCalendarDay,
  parseInstant,
  toDate,
} from '@church/time';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import { createCancelledAndStartedRecipe } from '@/seeds/e2e/recipes/cancelled-and-started';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
// America/Sao_Paulo is UTC-3.
function dateOf(value: string): Date {
  return toDate({ instant: parseInstant({ value }) });
}

describe('cancelled-and-started E2E seed scenario', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('has a published Shift started at the anchor midnight and one cancelled block a week later', async () => {
    const scenario = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createCancelledAndStartedRecipe({
        journeyKey: 'alpha',
        anchor: ANCHOR,
      }),
    });
    const churchId = scenario.church.id;

    const [sentCycle] = await testDb
      .select({ id: cycle.id, state: cycle.state })
      .from(cycle)
      .where(eq(cycle.churchId, churchId));
    expect(sentCycle).toEqual({ id: scenario.cycle.id, state: 'sent' });

    const blocks = await testDb
      .select({
        event: event.title,
        block: eventTimeBlock.label,
        status: eventTimeBlock.status,
        shiftId: shift.id,
        shiftStart: shift.startTime,
        participation: ministryParticipation.state,
      })
      .from(shift)
      .innerJoin(eventTimeBlock, eq(shift.eventTimeBlockId, eventTimeBlock.id))
      .innerJoin(event, eq(eventTimeBlock.eventId, event.id))
      .innerJoin(
        ministryParticipation,
        eq(shift.participationId, ministryParticipation.id),
      )
      .where(eq(shift.churchId, churchId))
      .orderBy(asc(shift.startTime));
    expect(blocks).toEqual([
      {
        event: 'Vigília de Oração',
        block: 'Vigília',
        status: 'active',
        shiftId: scenario.startedShiftId,
        shiftStart: dateOf('2026-03-15T03:00:00.000Z'),
        participation: 'published',
      },
      {
        event: 'Culto de Domingo',
        block: 'Manhã',
        status: 'active',
        shiftId: scenario.activeShiftId,
        shiftStart: dateOf('2026-03-22T12:00:00.000Z'),
        participation: 'published',
      },
      {
        event: 'Culto de Domingo',
        block: 'Noite',
        status: 'cancelled',
        shiftId: scenario.cancelledShiftId,
        shiftStart: dateOf('2026-03-22T22:00:00.000Z'),
        participation: 'published',
      },
    ]);

    const assigned = await testDb
      .select({
        shiftId: assignment.shiftId,
        volunteerId: assignment.volunteerId,
        status: assignment.status,
      })
      .from(assignment)
      .where(eq(assignment.churchId, churchId));
    expect(assigned).toEqual([
      {
        shiftId: scenario.startedShiftId,
        volunteerId: scenario.personas.volunteer.volunteerId,
        status: 'pending',
      },
    ]);
  });
});
