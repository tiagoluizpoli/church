import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, RoleId } from '@/domain/branded-ids';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

describe('DrizzleRoleRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleRoleRepository({ db: schedulingTestDb });
    await expect(
      repo.getById({
        churchId: ChurchId.from(seed.churchAId),
        id: RoleId.from('nope'),
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
