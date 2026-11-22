import { NotFoundError } from '@church/core';
import * as schema from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId } from '@/domain/branded-ids';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

describe('DrizzleChurchRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for a well-formed uuid that does not exist', async () => {
    await seedSchedulingPhase3Base();
    const repo = new DrizzleChurchRepository({ db: schedulingTestDb });

    await expect(
      repo.getById({
        id: ChurchId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it.each([
    '99999999-9999-4999-8999-999999999999',
    'not-a-uuid',
  ])('getSettings throws NotFoundError for Church %s', async (id) => {
    await seedSchedulingPhase3Base();
    const repo = new DrizzleChurchRepository({ db: schedulingTestDb });

    await expect(repo.getSettings({ id: ChurchId.from(id) })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("reads a Church's settings inside the caller's transaction, never from a second connection", async () => {
    const { churchAId } = await seedSchedulingPhase3Base();
    // One connection, held by the transaction: any read outside it waits.
    const pool = new pg.Pool({
      connectionString: getIntegrationDatabaseUrl(),
      max: 1,
      connectionTimeoutMillis: 2_000,
    });
    const db = drizzle(pool, { schema });
    const repo = new DrizzleChurchRepository({ db });
    try {
      const settings = await new DrizzleUnitOfWork({ db }).run((tx) =>
        repo.getSettings({ id: ChurchId.from(churchAId), tx }),
      );
      expect(settings.addresses).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
