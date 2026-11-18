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
const MIGRATION_TAG = '0031_ministry-active-name';
const INDEX = 'ministry_church_active_name_idx';
const scratchName = `church_ministry_name_migration_${process.pid}`;

const ids = {
  churchA: '20000000-0000-4000-8000-000000000001',
  churchB: '20000000-0000-4000-8000-000000000002',
  kids: '20000000-0000-4000-8000-0000000000a1',
  kidsDuplicate: '20000000-0000-4000-8000-0000000000a2',
  kidsArchived: '20000000-0000-4000-8000-0000000000a3',
  kidsOtherChurch: '20000000-0000-4000-8000-0000000000a4',
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

async function insertMinistry(
  client: pg.Client,
  id: string,
  churchId: string,
  name: string,
) {
  return client.query(
    'INSERT INTO ministry (id, church_id, name) VALUES ($1, $2, $3)',
    [id, churchId, name],
  );
}

async function ministryNames() {
  const { rows } = await scratch.query(
    'SELECT id, name, deleted_at IS NOT NULL AS archived FROM ministry ORDER BY id',
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

  // A migrations copy whose journal stops before the active-name index.
  folder = mkdtempSync(join(tmpdir(), 'ministry-name-migration-'));
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

  for (const [id, name] of [
    [ids.churchA, 'Church A'],
    [ids.churchB, 'Church B'],
  ]) {
    await scratch.query(
      'INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, now())',
      [id, name, id],
    );
    await scratch.query('INSERT INTO church (id) VALUES ($1)', [id]);
  }
  await insertMinistry(scratch, ids.kids, ids.churchA, 'Kids');
  await insertMinistry(scratch, ids.kidsDuplicate, ids.churchA, 'KIDS');
  await insertMinistry(scratch, ids.kidsArchived, ids.churchA, 'kids');
  await scratch.query('UPDATE ministry SET deleted_at = now() WHERE id = $1', [
    ids.kidsArchived,
  ]);
  await insertMinistry(scratch, ids.kidsOtherChurch, ids.churchB, 'Kids');
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`migration ${MIGRATION_TAG}`, () => {
  it('refuses active case-insensitive duplicates with a diagnostic naming them, changing nothing', async () => {
    const before = await ministryNames();

    await expect(applyMigration()).rejects.toThrow(
      new RegExp(`${ids.churchA}.*(Kids.*KIDS|KIDS.*Kids)`),
    );

    expect(await ministryNames()).toEqual(before);
  });

  it('applies once the duplicate is resolved, keeping every identity', async () => {
    await scratch.query("UPDATE ministry SET name = 'Kids 2' WHERE id = $1", [
      ids.kidsDuplicate,
    ]);

    await applyMigration();

    expect((await ministryNames()).map((row) => row.id)).toEqual([
      ids.kids,
      ids.kidsDuplicate,
      ids.kidsArchived,
      ids.kidsOtherChurch,
    ]);
  });

  it('refuses a new active case variant in the same Church', async () => {
    await expect(
      insertMinistry(scratch, crypto.randomUUID(), ids.churchA, 'kIdS'),
    ).rejects.toMatchObject({ code: '23505', constraint: INDEX });
  });

  it('allows the name in another Church and reuse once the active one is archived', async () => {
    await insertMinistry(scratch, crypto.randomUUID(), ids.churchB, 'Youth');
    await insertMinistry(scratch, crypto.randomUUID(), ids.churchA, 'Youth');
    await scratch.query(
      'UPDATE ministry SET deleted_at = now() WHERE id = $1',
      [ids.kids],
    );

    await expect(
      insertMinistry(scratch, crypto.randomUUID(), ids.churchA, 'KIDS'),
    ).resolves.toBeDefined();
  });

  it('lets exactly one of two concurrent case-variant inserts win', async () => {
    const second = new pg.Client({ connectionString: scratchUrls().scratch });
    await second.connect();
    try {
      const results = await Promise.allSettled([
        insertMinistry(scratch, crypto.randomUUID(), ids.churchA, 'Media'),
        insertMinistry(second, crypto.randomUUID(), ids.churchA, 'MEDIA'),
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
