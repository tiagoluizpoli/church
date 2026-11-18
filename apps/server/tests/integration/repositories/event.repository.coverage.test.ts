import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, EventId } from '@/domain/branded-ids';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

describe('DrizzleEventRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for a well-formed uuid that does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventRepository({ db: schedulingTestDb });

    await expect(
      repo.getById({
        churchId: ChurchId.from(seed.churchAId),
        eventId: EventId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
