import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  MinistryParticipationId,
} from '../../../src/domain/branded-ids';
import { DrizzleMinistryParticipationRepository } from '../../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleMinistryParticipationRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    await expect(
      repo.getById({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from('not-a-uuid'),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('listByIds returns [] without querying when participationIds is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const result = await repo.listByIds({
      churchId: ChurchId.from(seed.churchAId),
      participationIds: [],
    });
    expect(result).toEqual([]);
  });

  it('updateState throws NotFoundError when the participation does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    await expect(
      repo.updateState({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
        state: 'published',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
