import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId } from '../../../src/domain/branded-ids';
import { DrizzleChurchRepository } from '../../../src/infrastructure/repositories/drizzle-church.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleChurchRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for a well-formed uuid that does not exist', async () => {
    await seedSchedulingPhase3Base();
    const repo = new DrizzleChurchRepository(schedulingTestDb);

    await expect(
      repo.getById(ChurchId.from('99999999-9999-4999-8999-999999999999')),
    ).rejects.toThrow(NotFoundError);
  });
});
