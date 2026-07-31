import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, RoleId } from '../../../src/domain/branded-ids';
import { DrizzleRoleRepository } from '../../../src/infrastructure/repositories/drizzle-role.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleRoleRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleRoleRepository({ db: schedulingTestDb });
    await expect(
      repo.getById(ChurchId.from(seed.churchAId), RoleId.from('nope')),
    ).rejects.toThrow(NotFoundError);
  });
});
