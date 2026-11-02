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
const MIGRATION_TAG = '0032_role-archive';
const INDEX = 'role_ministry_active_name_idx';
const scratchName = `church_role_archive_migration_${process.pid}`;

const ids = {
  church: '30000000-0000-4000-8000-000000000001',
  worship: '30000000-0000-4000-8000-0000000000b1',
  kids: '30000000-0000-4000-8000-0000000000b2',
  singer: '30000000-0000-4000-8000-0000000000c1',
  singerDuplicate: '30000000-0000-4000-8000-0000000000c2',
  singerOtherMinistry: '30000000-0000-4000-8000-0000000000c3',
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

async function insertRole(
  client: pg.Client,
  id: string,
  ministryId: string,
  name: string,
) {
  return client.query(
    'INSERT INTO role (id, church_id, ministry_id, name) VALUES ($1, $2, $3, $4)',
    [id, ids.church, ministryId, name],
  );
}

async function roleIds() {
  const { rows } = await scratch.query('SELECT id FROM role ORDER BY id');
  return rows.map((row) => row.id);
}

beforeAll(async () => {
  const urls = scratchUrls();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before the Role archive migration.
  folder = mkdtempSync(join(tmpdir(), 'role-archive-migration-'));
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
    'INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, now())',
    [ids.church, 'Church', ids.church],
  );
  await scratch.query('INSERT INTO church (id) VALUES ($1)', [ids.church]);
  for (const [id, name] of [
    [ids.worship, 'Worship'],
    [ids.kids, 'Kids'],
  ]) {
    await scratch.query(
      'INSERT INTO ministry (id, church_id, name) VALUES ($1, $2, $3)',
      [id, ids.church, name],
    );
  }
  await insertRole(scratch, ids.singer, ids.worship, 'Singer');
  await insertRole(scratch, ids.singerDuplicate, ids.worship, 'SINGER');
  await insertRole(scratch, ids.singerOtherMinistry, ids.kids, 'Singer');
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`migration ${MIGRATION_TAG}`, () => {
  it('refuses case-insensitive Role duplicates in one Ministry with a diagnostic naming them, changing nothing', async () => {
    const before = await roleIds();

    await expect(applyMigration()).rejects.toThrow(
      new RegExp(`${ids.worship}.*(Singer.*SINGER|SINGER.*Singer)`),
    );

    expect(await roleIds()).toEqual(before);
  });

  it('applies once the duplicate is resolved, keeping every identity active', async () => {
    await scratch.query("UPDATE role SET name = 'Singer 2' WHERE id = $1", [
      ids.singerDuplicate,
    ]);

    await applyMigration();

    const { rows } = await scratch.query(
      'SELECT id, archived_at IS NOT NULL AS archived FROM role ORDER BY id',
    );
    expect(rows).toEqual([
      { id: ids.singer, archived: false },
      { id: ids.singerDuplicate, archived: false },
      { id: ids.singerOtherMinistry, archived: false },
    ]);
  });

  it('refuses a new active case variant in the same Ministry', async () => {
    await expect(
      insertRole(scratch, crypto.randomUUID(), ids.worship, 'sInGeR'),
    ).rejects.toMatchObject({ code: '23505', constraint: INDEX });
  });

  it('allows the name in another Ministry and reuse once the active one is archived', async () => {
    await insertRole(scratch, crypto.randomUUID(), ids.kids, 'Drums');
    await insertRole(scratch, crypto.randomUUID(), ids.worship, 'Drums');
    await scratch.query('UPDATE role SET archived_at = now() WHERE id = $1', [
      ids.singer,
    ]);

    await expect(
      insertRole(scratch, crypto.randomUUID(), ids.worship, 'SINGER'),
    ).resolves.toBeDefined();
  });

  it('lets exactly one of two concurrent case-variant inserts win', async () => {
    const second = new pg.Client({ connectionString: scratchUrls().scratch });
    await second.connect();
    try {
      const results = await Promise.allSettled([
        insertRole(scratch, crypto.randomUUID(), ids.worship, 'Keys'),
        insertRole(second, crypto.randomUUID(), ids.worship, 'KEYS'),
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
