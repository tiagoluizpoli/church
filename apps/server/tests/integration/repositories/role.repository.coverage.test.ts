import { NotFoundError } from '@church/core';
import { role } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, MinistryId, RoleId } from '../../../src/domain/branded-ids';
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
    const repo = new DrizzleRoleRepository(schedulingTestDb);
    await expect(
      repo.getById(ChurchId.from(seed.churchAId), RoleId.from('nope')),
    ).rejects.toThrow(NotFoundError);
  });

  it('listGlobalAndMinistryRoleIds returns only global roles when ministryIds is empty, and global+ministry roles otherwise', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleRoleRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    const [globalRole, ministryRole, otherMinistryRole] = await schedulingTestDb
      .insert(role)
      .values([
        {
          churchId: seed.churchAId,
          ministryId: null,
          name: 'Global Role',
          isGlobal: true,
        },
        {
          churchId: seed.churchAId,
          ministryId: seed.ministryAId,
          name: 'Ministry Role',
          isGlobal: false,
        },
        {
          churchId: seed.churchAId,
          ministryId: seed.ministryBId,
          name: 'Other Ministry Role',
          isGlobal: false,
        },
      ])
      .returning();
    if (!globalRole || !ministryRole || !otherMinistryRole) {
      throw new Error('role seed failed');
    }

    const onlyGlobal = await repo.listGlobalAndMinistryRoleIds(churchId, []);
    expect(onlyGlobal).toEqual([globalRole.id]);

    const globalAndMinistry = await repo.listGlobalAndMinistryRoleIds(
      churchId,
      [MinistryId.from(seed.ministryAId)],
    );
    expect(new Set(globalAndMinistry)).toEqual(
      new Set([globalRole.id, ministryRole.id]),
    );
    expect(globalAndMinistry).not.toContain(otherMinistryRole.id);
  });
});
