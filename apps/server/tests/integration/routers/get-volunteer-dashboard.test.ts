import { assignment, availability, event, timeSlot } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

describe('getVolunteerDashboard', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();

    const eventStart = new Date('2099-01-05T09:00:00Z');
    const eventEnd = new Date('2099-01-05T11:00:00Z');

    await testDb
      .update(event)
      .set({
        startDate: eventStart,
        endDate: eventEnd,
        status: 'draft',
      })
      .where(eq(event.id, SEED.eventDraft));

    await testDb
      .update(timeSlot)
      .set({
        startTime: eventStart,
        endTime: eventEnd,
      })
      .where(eq(timeSlot.id, SEED.slotDraft));

    await testDb
      .delete(assignment)
      .where(eq(assignment.slotId, SEED.slotDraft));

    await testDb
      .delete(availability)
      .where(
        and(
          eq(availability.churchId, SEED.church),
          eq(availability.volunteerId, SEED.volunteerAlice),
        ),
      );
  });

  it('returns an availability task for an upcoming Event with incomplete event-scoped availability', async () => {
    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getVolunteerDashboard();

    expect(result.availabilityTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: SEED.eventDraft,
          eventTitle: 'Youth Gathering',
          ministryId: SEED.ministryAdult,
          completionState: 'missing',
        }),
      ]),
    );
  });
});
