import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, VolunteerId } from '../../../src/domain/branded-ids';
import { DrizzleVolunteerRepository } from '../../../src/infrastructure/repositories/drizzle-volunteer.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleVolunteerRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for a well-formed uuid that does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerRepository({ db: schedulingTestDb });

    await expect(
      repo.getById(
        ChurchId.from(seed.churchAId),
        VolunteerId.from('99999999-9999-4999-8999-999999999999'),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('listByIds returns [] without querying when ids is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerRepository({ db: schedulingTestDb });

    const result = await repo.listByIds(ChurchId.from(seed.churchAId), []);
    expect(result).toEqual([]);
  });
});
