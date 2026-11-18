import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIntegrationDatabaseUrl } from '../../src/integration-database-url';

const MIGRATIONS = join(import.meta.dirname, '../../src/migrations');
const MIGRATION_TAG = '0052_ministry_default_direction_all_out';
const scratchName = `church_ministry_direction_migration_${process.pid}`;

const church = '30000000-0000-4000-8000-000000000001';
const ministries = {
  allIn: '30000000-0000-4000-8000-0000000000a1',
  allOut: '30000000-0000-4000-8000-0000000000a2',
  archivedAllIn: '30000000-0000-4000-8000-0000000000a3',
};

let admin: pg.Client;
let scratch: pg.Client;
let folder: string;

function scratchUrls() {
  const url = new URL(getIntegrationDatabaseUrl());
  const scratchUrl = new URL(url);
  url.pathname = '/postgres';
  scratchUrl.pathname = `/${scratchName}`;
  return { admin: url.toString(), scratch: scratchUrl.toString() };
}

async function applyMigration() {
  for (const statement of readFileSync(
    join(MIGRATIONS, `${MIGRATION_TAG}.sql`),
    'utf8',
  ).split('--> statement-breakpoint')) {
    await scratch.query(statement);
  }
}

async function directions() {
  const { rows } = await scratch.query(
    'SELECT id, default_direction AS direction, updated_at FROM ministry ORDER BY id',
  );
  return rows;
}

beforeAll(async () => {
  const urls = scratchUrls();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before the normalization.
  folder = mkdtempSync(join(tmpdir(), 'ministry-direction-migration-'));
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const index = journal.entries.findIndex(
    (entry: { tag: string }) => entry.tag === MIGRATION_TAG,
  );
  if (index < 0) throw new Error(`Missing migration: ${MIGRATION_TAG}`);
  journal.entries = journal.entries.slice(0, index);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(drizzle(scratch), { migrationsFolder: folder });

  await scratch.query(
    'INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, now())',
    [church, 'Church', church],
  );
  await scratch.query('INSERT INTO church (id) VALUES ($1)', [church]);
  for (const [id, name, direction, archived] of [
    [ministries.allIn, 'All in', 'all_in', false],
    [ministries.allOut, 'All out', 'all_out', false],
    [ministries.archivedAllIn, 'Archived', 'all_in', true],
  ] as const) {
    await scratch.query(
      `INSERT INTO ministry (id, church_id, name, default_direction, deleted_at, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END, '2026-01-01T00:00:00Z')`,
      [id, church, name, direction, archived],
    );
  }
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`migration ${MIGRATION_TAG}`, () => {
  it('normalizes every all_in Ministry to all_out, archived included, and is repeat-safe', async () => {
    await applyMigration();
    const first = await directions();
    expect(first.map((row) => row.direction)).toEqual([
      'all_out',
      'all_out',
      'all_out',
    ]);

    await applyMigration();
    expect(await directions()).toEqual(first);
  });

  it('leaves rows already all_out untouched', async () => {
    const { rows } = await scratch.query(
      'SELECT updated_at FROM ministry WHERE id = $1',
      [ministries.allOut],
    );
    expect(rows[0].updated_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps all_out as the default for a new Ministry and still accepts all_in', async () => {
    await scratch.query(
      `INSERT INTO ministry (church_id, name) VALUES ($1, 'Fresh')`,
      [church],
    );
    const { rows } = await scratch.query(
      `SELECT default_direction FROM ministry WHERE name = 'Fresh'`,
    );
    expect(rows[0].default_direction).toBe('all_out');
    await expect(
      scratch.query(
        `UPDATE ministry SET default_direction = 'all_in' WHERE name = 'Fresh'`,
      ),
    ).resolves.toBeDefined();
  });
});
