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
const MIGRATION_TAG = '0034_usual-setup-indexed-headcounts';
const scratchName = `church_usual_setup_indexed_migration_${process.pid}`;

const ids = {
  church: '40000000-0000-4000-8000-000000000001',
  ministry: '40000000-0000-4000-8000-0000000000a1',
  template: '40000000-0000-4000-8000-0000000000b1',
  sector: '40000000-0000-4000-8000-0000000000c1',
  role: '40000000-0000-4000-8000-0000000000d1',
  otherRole: '40000000-0000-4000-8000-0000000000d2',
};

const BLOCKS = {
  wholeBlock: '40000000-0000-4000-8000-0000000000e1',
  threeEqual: '40000000-0000-4000-8000-0000000000e2',
  twoManual: '40000000-0000-4000-8000-0000000000e3',
  notServed: '40000000-0000-4000-8000-0000000000e4',
  alreadyIndexed: '40000000-0000-4000-8000-0000000000e5',
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
  await scratch.query(
    readFileSync(join(MIGRATIONS, `${MIGRATION_TAG}.sql`), 'utf8'),
  );
}

const singer = { sectorId: ids.sector, roleId: ids.role, peopleNeeded: 2 };
const helper = { sectorId: ids.sector, roleId: ids.otherRole, peopleNeeded: 1 };

async function insertSetup(
  blockId: string,
  shiftSplit: unknown,
  headcounts: unknown[],
  serves = true,
) {
  await scratch.query(
    'INSERT INTO usual_setup (church_id, ministry_id, source_template_time_block_id, serves, shift_split, headcounts) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      ids.church,
      ids.ministry,
      blockId,
      serves,
      JSON.stringify(shiftSplit),
      JSON.stringify(headcounts),
    ],
  );
}

async function headcountsOf(blockId: string) {
  const { rows } = await scratch.query(
    'SELECT headcounts FROM usual_setup WHERE source_template_time_block_id = $1',
    [blockId],
  );
  return rows[0]?.headcounts;
}

beforeAll(async () => {
  const urls = scratchUrls();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before the indexed-headcount migration.
  folder = mkdtempSync(join(tmpdir(), 'usual-setup-indexed-migration-'));
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
  await scratch.query(
    'INSERT INTO ministry (id, church_id, name) VALUES ($1, $2, $3)',
    [ids.ministry, ids.church, 'Worship'],
  );
  await scratch.query(
    `INSERT INTO event_template (id, church_id, name, weekday) VALUES ($1, $2, 'Sunday', 0)`,
    [ids.template, ids.church],
  );
  for (const [order, blockId] of Object.values(BLOCKS).entries()) {
    await scratch.query(
      `INSERT INTO template_time_block (id, church_id, template_id, label, start_time, end_time, "order") VALUES ($1, $2, $3, $4, '09:00', '12:00', $5)`,
      [blockId, ids.church, ids.template, `Block ${order}`, order],
    );
  }

  await insertSetup(BLOCKS.wholeBlock, { kind: 'equal', count: 1 }, [
    singer,
    helper,
  ]);
  await insertSetup(BLOCKS.threeEqual, { kind: 'equal', count: 3 }, [singer]);
  await insertSetup(
    BLOCKS.twoManual,
    {
      kind: 'manual',
      spans: [
        { startTime: '09:00', endTime: '10:00' },
        { startTime: '10:00', endTime: '12:00' },
      ],
    },
    [singer],
  );
  await insertSetup(BLOCKS.notServed, { kind: 'equal', count: 1 }, [], false);
  await insertSetup(BLOCKS.alreadyIndexed, { kind: 'equal', count: 2 }, [
    { ...singer, shiftIndex: 1 },
  ]);

  await applyMigration();
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe('0034 indexes UsualSetup headcounts per Shift', () => {
  it('gives a whole-block entry index 0 on every pair', async () => {
    expect(await headcountsOf(BLOCKS.wholeBlock)).toEqual([
      { ...singer, shiftIndex: 0 },
      { ...helper, shiftIndex: 0 },
    ]);
  });

  it('repeats a block-wide count on each equal Shift, keeping its per-Shift meaning', async () => {
    expect(await headcountsOf(BLOCKS.threeEqual)).toEqual([
      { ...singer, shiftIndex: 0 },
      { ...singer, shiftIndex: 1 },
      { ...singer, shiftIndex: 2 },
    ]);
  });

  it('repeats a block-wide count on each manual span', async () => {
    expect(await headcountsOf(BLOCKS.twoManual)).toEqual([
      { ...singer, shiftIndex: 0 },
      { ...singer, shiftIndex: 1 },
    ]);
  });

  it('leaves a not-served entry and an already-indexed entry unchanged', async () => {
    expect(await headcountsOf(BLOCKS.notServed)).toEqual([]);
    expect(await headcountsOf(BLOCKS.alreadyIndexed)).toEqual([
      { ...singer, shiftIndex: 1 },
    ]);
  });
});
