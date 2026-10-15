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
});
