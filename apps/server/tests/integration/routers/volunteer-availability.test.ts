import { assignment, availability, event, timeSlot } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

const EVENT_START = new Date('2099-01-05T09:00:00Z');
const EVENT_END = new Date('2099-01-05T12:00:00Z');
const SECOND_SLOT_START = new Date('2099-01-05T10:30:00Z');
const SECOND_SLOT_END = new Date('2099-01-05T12:00:00Z');
const SECOND_SLOT_ID = '77777777-7777-7777-7777-777777777779';

async function prepareFutureAvailabilityEvent(): Promise<void> {
  await truncateAll();
  await seed();

  await testDb
    .update(event)
    .set({
      startDate: EVENT_START,
      endDate: EVENT_END,
      status: 'draft',
    })
    .where(eq(event.id, SEED.eventDraft));

  await testDb
    .update(timeSlot)
    .set({
      startTime: EVENT_START,
      endTime: new Date('2099-01-05T10:30:00Z'),
    })
    .where(eq(timeSlot.id, SEED.slotDraft));

  await testDb.insert(timeSlot).values({
    id: SECOND_SLOT_ID,
    churchId: SEED.church,
    eventId: SEED.eventDraft,
    startTime: SECOND_SLOT_START,
    endTime: SECOND_SLOT_END,
    label: 'Late Service',
  });

  await testDb.delete(assignment).where(eq(assignment.slotId, SEED.slotDraft));

  await testDb
    .delete(availability)
    .where(
      and(
        eq(availability.churchId, SEED.church),
        eq(availability.volunteerId, SEED.volunteerAlice),
      ),
    );
}

describe('volunteer availability procedures', () => {
  beforeEach(async () => {
    await prepareFutureAvailabilityEvent();
  });

  it('saves slot answers and reports complete coverage when every event slot has a response', async () => {
    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.upsertAvailability({
      eventId: SEED.eventDraft,
      answers: [
        {
          slotId: SEED.slotDraft,
          response: 'available',
        },
        {
          slotId: SECOND_SLOT_ID,
          response: 'unavailable',
        },
      ],
    });

    expect(result.completionState).toBe('complete');
    expect(result.savedEntryIds).toHaveLength(2);

    const availability = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyAvailability({
      eventId: SEED.eventDraft,
    });

    expect(availability.slots).toEqual([
      expect.objectContaining({
        slotId: SEED.slotDraft,
        response: 'available',
      }),
      expect.objectContaining({
        slotId: SECOND_SLOT_ID,
        response: 'unavailable',
      }),
    ]);
  });

  it('rejects saves when one or more service slots are unanswered', async () => {
    await createCaller(SEED.userAlice).volunteer.upsertAvailability({
      eventId: SEED.eventDraft,
      answers: [
        {
          slotId: SEED.slotDraft,
          response: 'available',
        },
        {
          slotId: SECOND_SLOT_ID,
          response: 'available',
        },
      ],
    });

    await expect(
      createCaller(SEED.userAlice).volunteer.upsertAvailability({
        eventId: SEED.eventDraft,
        answers: [
          {
            slotId: SEED.slotDraft,
            response: 'available',
          },
        ],
      }),
    ).rejects.toThrowError('Please answer every service slot before saving');
  });

  it('deletes a saved availability entry', async () => {
    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.upsertAvailability({
      eventId: SEED.eventDraft,
      answers: [
        {
          slotId: SEED.slotDraft,
          response: 'available',
        },
        {
          slotId: SECOND_SLOT_ID,
          response: 'unavailable',
        },
      ],
    });

    await createCaller(SEED.userAlice).volunteer.deleteAvailability({
      id: result.savedEntryIds[0] ?? '',
    });

    const availability = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyAvailability({
      eventId: SEED.eventDraft,
    });

    expect(availability.slots).toEqual([
      expect.objectContaining({
        slotId: SEED.slotDraft,
        response: undefined,
      }),
      expect.objectContaining({
        slotId: SECOND_SLOT_ID,
        response: 'unavailable',
      }),
    ]);
  });
});
