import { db } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ChurchId,
  EventId,
  TimeSlotId,
} from '../../../src/domain/branded-ids';
import { DrizzleTimeSlotRepository } from '../../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { seed, truncateAll } from './setup';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const EVENT = '66666666-6666-6666-6666-666666666661' as EventId;
const SLOT = '77777777-7777-7777-7777-777777777771' as TimeSlotId;

const repo = new DrizzleTimeSlotRepository({ db: db });

// Seed slot-1 spans 2024-06-05 09:00–11:00 UTC on the draft event.
describe('DrizzleTimeSlotRepository.findOverlapping (T091)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
  });

  it('returns [] when the range does not overlap any slot', async () => {
    const result = await repo.findOverlapping(
      CHURCH,
      EVENT,
      new Date('2024-06-05T14:00:00Z'),
      new Date('2024-06-05T15:00:00Z'),
    );
    expect(result).toEqual([]);
  });

  it('returns the matching slot when ranges intersect', async () => {
    const result = await repo.findOverlapping(
      CHURCH,
      EVENT,
      new Date('2024-06-05T10:00:00Z'),
      new Date('2024-06-05T12:00:00Z'),
    );
    expect(result.map((s) => s.id)).toContain(SLOT);
  });

  it('treats exactly-adjacent ranges as non-overlapping', async () => {
    const result = await repo.findOverlapping(
      CHURCH,
      EVENT,
      new Date('2024-06-05T11:00:00Z'),
      new Date('2024-06-05T12:00:00Z'),
    );
    expect(result).toEqual([]);
  });

  it('excludes the slot identified by excludeSlotId', async () => {
    const result = await repo.findOverlapping(
      CHURCH,
      EVENT,
      new Date('2024-06-05T09:00:00Z'),
      new Date('2024-06-05T11:00:00Z'),
      SLOT,
    );
    expect(result).toEqual([]);
  });
});
