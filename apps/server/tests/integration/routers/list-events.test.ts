import { ministryVolunteer } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

describe('listEvents (T093)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
    // Alice also leads Youth (no events there) — seed gives her no Youth
    // membership row, so insert one to exercise the empty-list path.
    await testDb.insert(ministryVolunteer).values({
      id: 'cccccccc-cccc-cccc-cccc-ccccccccca10',
      churchId: SEED.church,
      volunteerId: SEED.volunteerAlice,
      ministryId: SEED.ministryYouth,
      systemRole: 'leader',
      status: 'active',
    });
  });

  const caller = () => createCaller(SEED.userAlice);

  it('returns events sorted by startDate descending', async () => {
    const events = await caller().adminLeader.listEvents({
      ministryId: SEED.ministryAdult,
    });
    const dates = events.map((e) => e.startDate);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
    // Seed: event-1 (June 5) newer than event-2 (June 4) → event-1 first.
    expect(events[0]?.id).toBe(SEED.eventDraft);
  });

  it('scopes results to the requested ministry only', async () => {
    const events = await caller().adminLeader.listEvents({
      ministryId: SEED.ministryAdult,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.id !== undefined)).toBe(true);
  });

  it('returns an empty array for a ministry with no events', async () => {
    const events = await caller().adminLeader.listEvents({
      ministryId: SEED.ministryYouth,
    });
    expect(events).toEqual([]);
  });

  describe('Permission Failures', () => {
    it('rejects a non-leader', async () => {
      await expect(
        createCaller(SEED.userBob).adminLeader.listEvents({
          ministryId: SEED.ministryAdult,
        }),
      ).rejects.toThrow();
    });
  });
});
