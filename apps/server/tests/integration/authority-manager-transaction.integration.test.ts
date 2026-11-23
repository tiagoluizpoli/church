import * as schema from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import {
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

/** Runs `work` in a transaction on a one-connection pool: any read outside the transaction times out. */
async function inOneConnectionTransaction<T>(
  work: (manager: DbAuthorityManager, tx: TransactionContext) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({
    connectionString: getIntegrationDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  const db = drizzle(pool, { schema });
  const manager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
    eventRepository: new DrizzleEventRepository({ db }),
    eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
    ministryRepository: new DrizzleMinistryRepository({ db }),
  });
  try {
    return await new DrizzleUnitOfWork({ db }).run((tx) => work(manager, tx));
  } finally {
    await pool.end();
  }
}

describe("DbAuthorityManager inside the caller's transaction", () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('decides authority and invitation authority without a second connection', async () => {
    const { churchAId, adminUserId, ministryAId } =
      await seedSchedulingPhase3Base();
    const churchId = ChurchId.from(churchAId);
    const userId = UserId.from(adminUserId);

    const [decision, invitations] = await inOneConnectionTransaction(
      async (manager, tx) => [
        await manager.decideAuthority({
          churchId,
          userId,
          action: 'manage',
          resource: { type: 'church', churchId },
          scope: 'object',
          tx,
        }),
        await manager.canManageInvitations({
          churchId,
          userId,
          invitations: [
            {
              ministryId: MinistryId.from(ministryAId),
              ministryAccessLevel: 'volunteer',
            },
          ],
          tx,
        }),
      ],
    );

    expect(decision.allowed).toBe(true);
    expect(invitations).toEqual([true]);
  });
});
