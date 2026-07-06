import { NotFoundError } from '@church/core';
import { ministry } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, MinistryId } from '../../../src/domain/branded-ids';
import { DrizzleMinistryRepository } from '../../../src/infrastructure/repositories/drizzle-ministry.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleMinistryRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryRepository(schedulingTestDb);
    await expect(
      repo.getById(ChurchId.from(seed.churchAId), MinistryId.from('nope')),
    ).rejects.toThrow(NotFoundError);
  });

  it('updateDefaultDirection persists the new direction and throws NotFoundError for a foreign-church ministry', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);
    const ministryId = MinistryId.from(seed.ministryAId);

    const updated = await repo.updateDefaultDirection({
      churchId,
      ministryId,
      defaultDirection: 'all_out',
    });
    expect(updated.defaultDirection).toBe('all_out');

    const settings = await repo.getSettings(churchId, ministryId);
    expect(settings.defaultDirection).toBe('all_out');

    await expect(
      repo.updateDefaultDirection({
        churchId: ChurchId.from(seed.churchBId),
        ministryId,
        defaultDirection: 'all_in',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('listByChurch excludes soft-deleted ministries', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    const before = await repo.listByChurch(churchId);
    expect(before).toHaveLength(1);

    await schedulingTestDb
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, seed.ministryAId));

    const after = await repo.listByChurch(churchId);
    expect(after).toHaveLength(0);
  });
});
