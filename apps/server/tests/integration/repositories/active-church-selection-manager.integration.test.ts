import 'reflect-metadata';
import * as schema from '@church/db';
import { createChurch } from '@church/db';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DbActiveChurchSelectionManager } from '../../../src/application/db-active-church-selection-manager';
import { ChurchId } from '../../../src/domain/branded-ids';
import { DrizzleChurchRepository } from '../../../src/infrastructure/repositories/drizzle-church.repository';

const DATABASE_URL = getTestDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const testDb = drizzle(pool, { schema });

const churchId = ChurchId.from('11111111-1111-4111-8111-c11111111121');

// Roots at `organization`/`user`: see the note on `truncateAll` in
// `tests/integration/repositories/setup.ts`.
async function resetDb(): Promise<void> {
  await testDb.execute(`
    TRUNCATE TABLE organization, "user" RESTART IDENTITY CASCADE
  `);
}

/** Only the Church row is exercised; the other collaborators stay unused. */
function createManager(): DbActiveChurchSelectionManager {
  return new DbActiveChurchSelectionManager(
    {} as never,
    {} as never,
    {} as never,
    new DrizzleChurchRepository({ db: testDb }),
  );
}

describe('DbActiveChurchSelectionManager.getChurchTimezone (integration)', () => {
  beforeEach(async () => {
    await resetDb();
    await createChurch({
      db: testDb,
      id: churchId,
      name: 'Timezone Church',
      slug: 'timezone-church',
      timezone: 'America/Sao_Paulo',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reads the Active Church's IANA timezone from its church row", async () => {
    await expect(createManager().getChurchTimezone({ churchId })).resolves.toBe(
      'America/Sao_Paulo',
    );
  });
});
