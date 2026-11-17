import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, CycleId } from '@/domain/branded-ids';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

describe('DrizzleCycleRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid and for a missing cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleCycleRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.getById({
        churchId,
        cycleId: CycleId.from('not-a-uuid'),
      }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      repo.getById({
        churchId,
        cycleId: CycleId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('updateState throws NotFoundError when the cycle does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleCycleRepository({ db: schedulingTestDb });

    await expect(
      repo.updateState({
        churchId: ChurchId.from(seed.churchAId),
        cycleId: CycleId.from('99999999-9999-4999-8999-999999999999'),
        state: 'sent',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  describe('findAnchors', () => {
    const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
    const today = day('2026-11-17');

    it('picks the running Sent Cycle and the earliest later non-Past one, Drafts included', async () => {
      const seed = await seedSchedulingPhase3Base();
      const repo = new DrizzleCycleRepository({ db: schedulingTestDb });
      const churchId = ChurchId.from(seed.churchAId);
      const create = (
        name: string,
        start: string,
        end: string,
        state: 'draft' | 'sent' | 'past',
      ) =>
        repo.create({
          churchId,
          name,
          startDate: day(start),
          endDate: day(end),
          state,
        });
      await create('October', '2026-10-01', '2026-10-31', 'past');
      await create('November', '2026-11-01', '2026-11-30', 'sent');
      await create('January', '2027-01-01', '2027-01-31', 'sent');
      await create('December', '2026-12-01', '2026-12-31', 'draft');
      // Another Church's earlier upcoming Cycle never leaks in.
      await repo.create({
        churchId: ChurchId.from(seed.churchBId),
        name: 'Other',
        startDate: day('2026-11-20'),
        endDate: day('2026-11-25'),
        state: 'sent',
      });

      const anchors = await repo.findAnchors({ churchId, today });

      expect(anchors.current?.name).toBe('November');
      expect(anchors.next?.name).toBe('December');
    });

    it('has no current Cycle while the one covering today is a Draft, and skips a Past later one', async () => {
      const seed = await seedSchedulingPhase3Base();
      const repo = new DrizzleCycleRepository({ db: schedulingTestDb });
      const churchId = ChurchId.from(seed.churchAId);
      const create = (
        name: string,
        start: string,
        end: string,
        state: 'draft' | 'sent' | 'past',
      ) =>
        repo.create({
          churchId,
          name,
          startDate: day(start),
          endDate: day(end),
          state,
        });
      await create('November', '2026-11-01', '2026-11-30', 'draft');
      await create('December', '2026-12-01', '2026-12-31', 'past');
      await create('January', '2027-01-01', '2027-01-31', 'sent');

      const anchors = await repo.findAnchors({ churchId, today });

      expect(anchors.current).toBeNull();
      expect(anchors.next?.name).toBe('January');
    });

    it('returns both empty for a Church with no Cycles', async () => {
      const seed = await seedSchedulingPhase3Base();
      const repo = new DrizzleCycleRepository({ db: schedulingTestDb });

      expect(
        await repo.findAnchors({
          churchId: ChurchId.from(seed.churchAId),
          today,
        }),
      ).toEqual({ current: null, next: null });
    });
  });
});
