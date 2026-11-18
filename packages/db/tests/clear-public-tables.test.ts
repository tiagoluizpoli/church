import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearPublicTables } from '@/clear-public-tables';
import { getIntegrationDatabaseUrl } from '@/integration-database-url';

const pool = new pg.Pool({
  connectionString: getIntegrationDatabaseUrl(),
  max: 1,
});

interface CountRow {
  count: string;
}

interface TableRow {
  tablename: string;
}

async function rowCount(table: string): Promise<number> {
  const result = await pool.query<CountRow>(
    `select count(*) from ${pg.escapeIdentifier(table)}`,
  );
  return Number(result.rows[0]?.count);
}

async function migrationCount(): Promise<number> {
  const result = await pool.query<CountRow>(
    'select count(*) from drizzle.__drizzle_migrations',
  );
  return Number(result.rows[0]?.count);
}

afterAll(async () => {
  await pool.end();
});

describe('clearPublicTables', () => {
  beforeEach(async () => {
    await clearPublicTables({ pool });
    // A member references both its organization and its user, so the reset
    // must empty tables that foreign keys tie together.
    await pool.query(`
      insert into "user" (id, name, email) values ('clear-user', 'Clear', 'clear@test.com');
      insert into organization (id, name, slug) values ('0c1ea500-0000-4000-8000-000000000001', 'Clear Org', 'clear-org');
      insert into member (id, organization_id, user_id, role) values ('clear-member', '0c1ea500-0000-4000-8000-000000000001', 'clear-user', 'member');
      insert into todo (text) values ('first'), ('second');
    `);
  });

  it('empties every public table and keeps the migration history', async () => {
    const migrationsBefore = await migrationCount();

    await clearPublicTables({ pool });

    const tables = await pool.query<TableRow>(
      `select tablename from pg_tables where schemaname = 'public'`,
    );
    for (const { tablename } of tables.rows) {
      expect({ tablename, rows: await rowCount(tablename) }).toEqual({
        tablename,
        rows: 0,
      });
    }
    expect(await migrationCount()).toBe(migrationsBefore);
    expect(migrationsBefore).toBeGreaterThan(0);
  });

  it('restarts generated ids', async () => {
    await clearPublicTables({ pool });

    const inserted = await pool.query<{ id: number }>(
      `insert into todo (text) values ('after reset') returning id`,
    );
    expect(inserted.rows[0]?.id).toBe(1);
  });

  it('leaves foreign keys enforced on the connection afterwards', async () => {
    await clearPublicTables({ pool });

    await expect(
      pool.query(
        `insert into member (id, organization_id, user_id) values ('orphan', '0c1ea500-0000-4000-8000-0000000000ff', 'missing-user')`,
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
