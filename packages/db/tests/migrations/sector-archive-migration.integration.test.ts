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
const MIGRATION_TAG = '0032_sector-archive';
const INDEX = 'sector_ministry_active_name_idx';
const scratchName = `church_sector_archive_migration_${process.pid}`;

const ids = {
  church: '30000000-0000-4000-8000-000000000001',
  kids: '30000000-0000-4000-8000-0000000000a1',
  worship: '30000000-0000-4000-8000-0000000000a2',
  babies: '30000000-0000-4000-8000-0000000000b1',
  babiesDuplicate: '30000000-0000-4000-8000-0000000000b2',
  babiesOtherMinistry: '30000000-0000-4000-8000-0000000000b3',
};

let admin: pg.Client;
let scratch: pg.Client;
let folder: string;

interface ScratchUrls {
  admin: string;
  scratch: string;
}

function scratchUrls(): ScratchUrls {
  const url = new URL(getIntegrationDatabaseUrl());
  const scratchUrl = new URL(url);
  url.pathname = '/postgres';
  scratchUrl.pathname = `/${scratchName}`;
  return { admin: url.toString(), scratch: scratchUrl.toString() };
}

async function applyMigration() {
  await scratch.query('BEGIN');
  try {
    for (const statement of readFileSync(
      join(MIGRATIONS, `${MIGRATION_TAG}.sql`),
      'utf8',
    ).split('--> statement-breakpoint')) {
      await scratch.query(statement);
    }
    await scratch.query('COMMIT');
  } catch (error) {
    await scratch.query('ROLLBACK');
    throw error;
  }
}

async function insertSector(
  client: pg.Client,
  id: string,
  ministryId: string,
  name: string,
) {
  return client.query(
    'INSERT INTO sector (id, church_id, ministry_id, name) VALUES ($1, $2, $3, $4)',
    [id, ids.church, ministryId, name],
  );
}

async function sectorRows() {
  const { rows } = await scratch.query(
    'SELECT id, ministry_id, name FROM sector ORDER BY id',
  );
  return rows;
}

async function indexNames() {
  const { rows } = await scratch.query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'sector'",
  );
  return rows.map((row) => row.indexname as string);
}

beforeAll(async () => {
  const urls = scratchUrls();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before the Sector archive marker.
  folder = mkdtempSync(join(tmpdir(), 'sector-archive-migration-'));
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const migrationIndex = journal.entries.findIndex(
    (entry: { tag: string }) => entry.tag === MIGRATION_TAG,
  );
  if (migrationIndex < 0)
    throw new Error(`Missing migration: ${MIGRATION_TAG}`);
  journal.entries = journal.entries.slice(0, migrationIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(drizzle(scratch), { migrationsFolder: folder });

  await scratch.query(
    "INSERT INTO organization (id, name, slug, created_at) VALUES ($1, 'Church', $2, now())",
    [ids.church, ids.church],
  );
  await scratch.query('INSERT INTO church (id) VALUES ($1)', [ids.church]);
  for (const [id, name] of [
    [ids.kids, 'Kids'],
    [ids.worship, 'Worship'],
  ]) {
    await scratch.query(
      'INSERT INTO ministry (id, church_id, name) VALUES ($1, $2, $3)',
      [id, ids.church, name],
    );
  }
  // The old index is case-sensitive, so case variants could coexist.
  await insertSector(scratch, ids.babies, ids.kids, 'Babies Room');
  await insertSector(scratch, ids.babiesDuplicate, ids.kids, 'BABIES ROOM');
  await insertSector(
    scratch,
    ids.babiesOtherMinistry,
    ids.worship,
    'Babies Room',
  );
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`migration ${MIGRATION_TAG}`, () => {
  it('refuses active case-insensitive duplicates with a diagnostic naming them, changing nothing', async () => {
    const before = await sectorRows();

    await expect(applyMigration()).rejects.toThrow(
      new RegExp(
        `${ids.kids}.*(Babies Room.*BABIES ROOM|BABIES ROOM.*Babies Room)`,
      ),
    );

    expect(await sectorRows()).toEqual(before);
    expect(await indexNames()).toContain('sector_ministry_name_idx');
  });

  it('applies once the duplicate is resolved, keeping every identity and replacing the old index', async () => {
    await scratch.query("UPDATE sector SET name = 'Toddlers' WHERE id = $1", [
      ids.babiesDuplicate,
    ]);

    await applyMigration();

    expect((await sectorRows()).map((row) => row.id)).toEqual([
      ids.babies,
      ids.babiesDuplicate,
      ids.babiesOtherMinistry,
    ]);
    const { rows } = await scratch.query(
      'SELECT count(*)::int AS archived FROM sector WHERE archived_at IS NOT NULL',
    );
    expect(rows[0].archived).toBe(0);
    expect(await indexNames()).not.toContain('sector_ministry_name_idx');
    expect(await indexNames()).toContain(INDEX);
  });

  it('refuses a new active case variant in the same Ministry', async () => {
    await expect(
      insertSector(scratch, crypto.randomUUID(), ids.kids, 'babies room'),
    ).rejects.toMatchObject({ code: '23505', constraint: INDEX });
  });

  it('allows the name in another Ministry and reuse once the active one is archived', async () => {
    await insertSector(scratch, crypto.randomUUID(), ids.worship, 'Toddlers');
    await scratch.query('UPDATE sector SET archived_at = now() WHERE id = $1', [
      ids.babies,
    ]);

    await expect(
      insertSector(scratch, crypto.randomUUID(), ids.kids, 'BABIES ROOM'),
    ).resolves.toBeDefined();
  });

  it('lets exactly one of two concurrent case-variant inserts win', async () => {
    const second = new pg.Client({ connectionString: scratchUrls().scratch });
    await second.connect();
    try {
      const results = await Promise.allSettled([
        insertSector(scratch, crypto.randomUUID(), ids.kids, 'Main Door'),
        insertSector(second, crypto.randomUUID(), ids.kids, 'MAIN DOOR'),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: '23505', constraint: INDEX } });
    } finally {
      await second.end();
    }
  });
});
