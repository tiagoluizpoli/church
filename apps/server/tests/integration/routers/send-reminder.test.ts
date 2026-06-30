import { availability } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

describe('sendReminder (T108)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
  });

  const caller = () => createCaller(SEED.userAlice);

  it('counts ministry volunteers without availability overlapping the event window', async () => {
    // Seed ministryAdult member: volunteer-1, whose only availability is on
    // June 1 — it does not overlap the June 5 draft event → 1 non-responder.
    const result = await caller().adminLeader.sendReminder({
      eventId: SEED.eventDraft,
    });
    expect(result.notifiedCount).toBe(1);
  });

  it('does not remind volunteers who already answered this event', async () => {
    await testDb.insert(availability).values({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12',
      churchId: SEED.church,
      volunteerId: SEED.volunteerAlice,
      eventId: SEED.eventDraft,
      type: 'available',
      startTime: new Date('2026-06-05T09:00:00Z'),
      endTime: new Date('2026-06-05T11:00:00Z'),
      isAllDay: false,
    });

    const result = await caller().adminLeader.sendReminder({
      eventId: SEED.eventDraft,
    });

    expect(result.notifiedCount).toBe(0);
  });

  it('rejects an unknown event', async () => {
    await expect(
      caller().adminLeader.sendReminder({
        eventId: '66666666-6666-6666-6666-6666666666ff',
      }),
    ).rejects.toThrow(/not found/i);
  });

  describe('Permission Failures', () => {
    it('rejects a non-leader', async () => {
      await expect(
        createCaller(SEED.userBob).adminLeader.sendReminder({
          eventId: SEED.eventDraft,
        }),
      ).rejects.toThrow();
    });
  });
});
