import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId } from '../../../src/domain/branded-ids';
import { DrizzleTeamRepository } from '../../../src/infrastructure/repositories/drizzle-team.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleTeamRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('listByIds returns [] without querying when ids is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleTeamRepository({ db: schedulingTestDb });

    const result = await repo.listByIds(ChurchId.from(seed.churchAId), []);
    expect(result).toEqual([]);
  });
});
