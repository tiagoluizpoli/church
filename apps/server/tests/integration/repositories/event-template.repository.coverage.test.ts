import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, EventTemplateId } from '../../../src/domain/branded-ids';
import { DrizzleEventTemplateRepository } from '../../../src/infrastructure/repositories/drizzle-event-template.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleEventTemplateRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('update throws NotFoundError when the template does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });

    await expect(
      repo.update({
        churchId: ChurchId.from(seed.churchAId),
        templateId: EventTemplateId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
        name: 'Nope',
        weekday: 0,
        blocks: [],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('getById throws NotFoundError for an invalid uuid and for a missing template', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.getById({
        churchId,
        templateId: EventTemplateId.from('not-a-uuid'),
      }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      repo.getById({
        churchId,
        templateId: EventTemplateId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('getByIds returns [] without querying when templateIds is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });

    const result = await repo.getByIds({
      churchId: ChurchId.from(seed.churchAId),
      templateIds: [],
    });
    expect(result).toEqual([]);
  });
});
