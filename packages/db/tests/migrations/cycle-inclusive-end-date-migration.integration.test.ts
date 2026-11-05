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
const MIGRATION_TAG = '0042_cycle-inclusive-end-date';
const EXCLUSION = 'cycle_church_date_excl';
const DATE_CHECK = 'cycle_date_check';
const EXCLUSION_VIOLATION = '23P01';
const CHECK_VIOLATION = '23514';
const scratchName = `church_cycle_inclusive_migration_${process.pid}`;

const ids = {
  churchA: '20000000-0000-4000-8000-000000000001',
  churchB: '20000000-0000-4000-8000-000000000002',
  october: '20000000-0000-4000-8000-0000000000a1',
  lateOctober: '20000000-0000-4000-8000-0000000000a2',
  otherChurchOctober: '20000000-0000-4000-8000-0000000000a3',
  lastDayEvent: '20000000-0000-4000-8000-0000000000b1',
};

// Church-local evening of 11 October in São Paulo, already 12 October in UTC.
const LAST_DAY_EVENT_START = '2026-10-12T01:30:00.000Z';
const LAST_DAY_EVENT_END = '2026-10-12T03:00:00.000Z';

let admin: pg.Client;
let scratch: pg.Client;
let folder: string;

interface ScratchUrls {
  admin: string;
  scratch: string;
}

interface CycleRange {
  id: string;
  start: string;
  end: string;
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

async function insertCycle(
  churchId: string,
  start: string,
  end: string,
  id: string = crypto.randomUUID(),
) {
  return scratch.query(
    `INSERT INTO cycle (id, church_id, name, start_date, end_date) VALUES ($1, $2, 'Cycle', $3, $4)`,
    [id, churchId, start, end],
  );
}

async function cycleRanges(): Promise<CycleRange[]> {
  const { rows } = await scratch.query(
    'SELECT id, start_date::text AS start, end_date::text AS end FROM cycle ORDER BY id',
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

  // A migrations copy whose journal stops before the inclusive end date.
  folder = mkdtempSync(join(tmpdir(), 'cycle-inclusive-migration-'));
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
  // Old exclusive ends: [1 Oct, 12 Oct) touches [12 Oct, 26 Oct).
  await insertCycle(ids.churchA, '2026-10-01', '2026-10-12', ids.october);
  await insertCycle(ids.churchA, '2026-10-12', '2026-10-26', ids.lateOctober);
  await insertCycle(
    ids.churchB,
    '2026-10-01',
    '2026-10-12',
    ids.otherChurchOctober,
  );
  await scratch.query(
    `INSERT INTO event (id, church_id, cycle_id, title, start, "end") VALUES ($1, $2, $3, 'Last evening', $4, $5)`,
    [
      ids.lastDayEvent,
      ids.churchA,
      ids.october,
      LAST_DAY_EVENT_START,
      LAST_DAY_EVENT_END,
    ],
  );
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`migration ${MIGRATION_TAG}`, () => {
  it('moves every stored exclusive end to the previous day, keeping covered days and Event Instants', async () => {
    await applyMigration();

    expect(await cycleRanges()).toEqual([
      { id: ids.october, start: '2026-10-01', end: '2026-10-11' },
      { id: ids.lateOctober, start: '2026-10-12', end: '2026-10-25' },
      { id: ids.otherChurchOctober, start: '2026-10-01', end: '2026-10-11' },
    ]);
    const { rows } = await scratch.query(
      `SELECT start, "end" FROM event WHERE id = $1`,
      [ids.lastDayEvent],
    );
    expect(rows[0].start.toISOString()).toBe(LAST_DAY_EVENT_START);
    expect(rows[0].end.toISOString()).toBe(LAST_DAY_EVENT_END);
  });

  it('accepts a one-day Cycle and refuses a reversed one', async () => {
    await expect(
      insertCycle(ids.churchA, '2026-11-01', '2026-11-01'),
    ).resolves.toBeDefined();

    await expect(
      insertCycle(ids.churchA, '2026-11-10', '2026-11-09'),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: DATE_CHECK });
  });

  it('refuses a shared endpoint in the same Church', async () => {
    await expect(
      insertCycle(ids.churchA, '2026-10-25', '2026-10-31'),
    ).rejects.toMatchObject({
      code: EXCLUSION_VIOLATION,
      constraint: EXCLUSION,
    });
  });

  it('accepts the next day, a gap and the same dates in another Church', async () => {
    await insertCycle(ids.churchA, '2026-10-26', '2026-10-31');
    await insertCycle(ids.churchA, '2026-11-05', '2026-11-08');

    await expect(
      insertCycle(ids.churchB, '2026-10-12', '2026-10-25'),
    ).resolves.toBeDefined();
  });
});
