import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createDb } from '../src/client';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';

const db = createDb();
const admin = new pg.Client({ connectionString: getIntegrationDatabaseUrl() });

afterAll(async () => {
  await db.$client.end();
  await admin.end();
});

interface BackendRow extends Record<string, unknown> {
  pid: number;
}

describe('database client', () => {
  it('survives the database dropping an idle connection', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rows } = await db.execute<BackendRow>(
      sql`select pg_backend_pid() as pid`,
    );
    const [backend] = rows;
    await admin.connect();
    await admin.query('select pg_terminate_backend($1)', [backend?.pid]);
    await vi.waitFor(() => expect(logged).toHaveBeenCalled());

    const after = await db.execute(sql`select 1 as ok`);

    expect(after.rows).toEqual([{ ok: 1 }]);
    logged.mockRestore();
  });
});
