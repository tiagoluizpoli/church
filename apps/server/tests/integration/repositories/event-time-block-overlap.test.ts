import { db } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, truncateAll } from './setup';
import type { ChurchId, EventId, EventTimeBlockId } from '@/domain/branded-ids';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const EVENT = '66666666-6666-6666-6666-666666666661' as EventId;
const EVENT_TIME_BLOCK_ID =
  '77777777-7777-7777-7777-777777777771' as EventTimeBlockId;

const repo = new DrizzleEventTimeBlockRepository({ db: db });

// Seed event-time-block-1 spans 2024-06-05 09:00–11:00 UTC on the draft event.
describe('DrizzleEventTimeBlockRepository.findOverlapping (T091)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
  });

  it('returns [] when the range does not overlap any event time block', async () => {
    const result = await repo.findOverlapping({
      churchId: CHURCH,
      eventId: EVENT,
      startTime: new Date('2024-06-05T14:00:00Z'),
      endTime: new Date('2024-06-05T15:00:00Z'),
    });
    expect(result).toEqual([]);
  });

  it('returns the matching event time block when ranges intersect', async () => {
    const result = await repo.findOverlapping({
      churchId: CHURCH,
      eventId: EVENT,
      startTime: new Date('2024-06-05T10:00:00Z'),
      endTime: new Date('2024-06-05T12:00:00Z'),
    });
    expect(result.map((s) => s.id)).toContain(EVENT_TIME_BLOCK_ID);
  });

  it('treats exactly-adjacent ranges as non-overlapping', async () => {
    const result = await repo.findOverlapping({
      churchId: CHURCH,
      eventId: EVENT,
      startTime: new Date('2024-06-05T11:00:00Z'),
      endTime: new Date('2024-06-05T12:00:00Z'),
    });
    expect(result).toEqual([]);
  });

  it('excludes the event time block identified by excludeEventTimeBlockId', async () => {
    const result = await repo.findOverlapping({
      churchId: CHURCH,
      eventId: EVENT,
      startTime: new Date('2024-06-05T09:00:00Z'),
      endTime: new Date('2024-06-05T11:00:00Z'),
      excludeEventTimeBlockId: EVENT_TIME_BLOCK_ID,
    });
    expect(result).toEqual([]);
  });
});
