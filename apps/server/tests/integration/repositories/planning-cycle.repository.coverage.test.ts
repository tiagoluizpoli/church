import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, PlanningCycleId } from '../../../src/domain/branded-ids';
import { DrizzlePlanningCycleRepository } from '../../../src/infrastructure/repositories/drizzle-planning-cycle.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzlePlanningCycleRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid and for a missing cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzlePlanningCycleRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.getById({
        churchId,
        cycleId: PlanningCycleId.from('not-a-uuid'),
      }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      repo.getById({
        churchId,
        cycleId: PlanningCycleId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('updateState throws NotFoundError when the cycle does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzlePlanningCycleRepository(schedulingTestDb);

    await expect(
      repo.updateState({
        churchId: ChurchId.from(seed.churchAId),
        cycleId: PlanningCycleId.from('99999999-9999-4999-8999-999999999999'),
        state: 'locked',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
