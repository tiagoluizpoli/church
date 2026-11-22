import { NotFoundError } from '@church/core';
import * as schema from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, UserId } from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

/** Runs `work` in a transaction on a one-connection pool: any read outside the transaction times out. */
async function inOneConnectionTransaction<T>(
  work: (repo: DrizzleChurchRepository, tx: TransactionContext) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({
    connectionString: getIntegrationDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  const db = drizzle(pool, { schema });
  const repo = new DrizzleChurchRepository({ db });
  try {
    return await new DrizzleUnitOfWork({ db }).run((tx) => work(repo, tx));
  } finally {
    await pool.end();
  }
}

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
    const settings = await inOneConnectionTransaction((repo, tx) =>
      repo.getSettings({ id: ChurchId.from(churchAId), tx }),
    );
    expect(settings.addresses).toEqual([]);
  });

  it("reads a Church and a user name inside the caller's transaction, never from a second connection", async () => {
    const { churchAId, adminUserId } = await seedSchedulingPhase3Base();
    const [church, name] = await inOneConnectionTransaction((repo, tx) =>
      Promise.all([
        repo.getById({ id: ChurchId.from(churchAId), tx }),
        repo.findUserName({ userId: UserId.from(adminUserId), tx }),
      ]),
    );
    expect(church.id).toBe(churchAId);
    expect(name).toBe('Scheduling Admin');
  });
});
