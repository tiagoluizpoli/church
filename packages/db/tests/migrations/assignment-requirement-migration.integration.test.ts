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
const MIGRATION_TAG = '0021_gorgeous_sabretooth';
const scratchName = `church_assignment_requirement_${process.pid}`;

const ids = {
  church: '20000000-0000-4000-8000-000000000001',
  kids: '20000000-0000-4000-8000-0000000000a1',
  worship: '20000000-0000-4000-8000-0000000000a2',
  teacher: '20000000-0000-4000-8000-0000000000b1',
  helper: '20000000-0000-4000-8000-0000000000b2',
  zebra: '20000000-0000-4000-8000-0000000000c1',
  alpha: '20000000-0000-4000-8000-0000000000c2',
  tieKids: '20000000-0000-4000-8000-0000000000c3',
  tieWorship: '20000000-0000-4000-8000-0000000000c4',
  cycle: '20000000-0000-4000-8000-0000000000d1',
  event: '20000000-0000-4000-8000-0000000000d2',
  block: '20000000-0000-4000-8000-0000000000d3',
  participation: '20000000-0000-4000-8000-0000000000d4',
  firstShift: '20000000-0000-4000-8000-0000000000d5',
  secondShift: '20000000-0000-4000-8000-0000000000d6',
  teacherAtZebra: '20000000-0000-4000-8000-0000000000e1',
  teacherAtAlpha: '20000000-0000-4000-8000-0000000000e2',
  tieWinner: '20000000-0000-4000-8000-0000000000e3',
  tieLoser: '20000000-0000-4000-8000-0000000000e4',
  matchedAssignment: '20000000-0000-4000-8000-0000000000f1',
  tiedAssignment: '20000000-0000-4000-8000-0000000000f2',
  unmatchedAssignment: '20000000-0000-4000-8000-0000000000f3',
} as const;

interface MigrationUrls {
  admin: string;
  scratch: string;
}

interface MigrationJournal {
  entries: Array<{ tag: string }>;
}

function migrationUrls(): MigrationUrls {
  const adminUrl = new URL(getIntegrationDatabaseUrl());
  const scratchUrl = new URL(adminUrl);
  adminUrl.pathname = '/postgres';
  scratchUrl.pathname = `/${scratchName}`;
  return { admin: adminUrl.toString(), scratch: scratchUrl.toString() };
}

let admin: pg.Client;
let scratch: pg.Client;
let migrationsBeforeAssignmentRequirement: string;

async function seedPreMigrationAssignments(): Promise<void> {
  await scratch.query(
    `INSERT INTO organization (id, name, slug) VALUES ($1, 'Migration Church', 'assignment-migration-test')`,
    [ids.church],
  );
  await scratch.query('INSERT INTO church (id) VALUES ($1)', [ids.church]);
  await scratch.query(
    `INSERT INTO ministry (id, church_id, name) VALUES ($1, $3, 'Kids'), ($2, $3, 'Worship')`,
    [ids.kids, ids.worship, ids.church],
  );
  await scratch.query(
    `INSERT INTO role (id, church_id, ministry_id, name) VALUES ($1, $3, $4, 'Teacher'), ($2, $3, $5, 'Helper')`,
    [ids.teacher, ids.helper, ids.church, ids.kids, ids.worship],
  );
  await scratch.query(
    `INSERT INTO sector (id, church_id, ministry_id, name) VALUES
      ($1, $5, $6, 'Zebra'), ($2, $5, $6, 'Alpha'),
      ($3, $5, $6, 'Shared'), ($4, $5, $7, 'Shared')`,
    [
      ids.zebra,
      ids.alpha,
      ids.tieKids,
      ids.tieWorship,
      ids.church,
      ids.kids,
      ids.worship,
    ],
  );
  await scratch.query(
    `INSERT INTO cycle (id, church_id, name, start_date, end_date) VALUES ($1, $2, 'Cycle', '2026-11-01', '2026-12-01')`,
    [ids.cycle, ids.church],
  );
  await scratch.query(
    `INSERT INTO event (id, church_id, cycle_id, title, start, "end") VALUES ($1, $2, $3, 'Service', '2026-11-08T09:00Z', '2026-11-08T12:00Z')`,
    [ids.event, ids.church, ids.cycle],
  );
  await scratch.query(
    `INSERT INTO event_time_block (id, church_id, event_id, start_time, end_time) VALUES ($1, $2, $3, '2026-11-08T09:00Z', '2026-11-08T12:00Z')`,
    [ids.block, ids.church, ids.event],
  );
  await scratch.query(
    'INSERT INTO ministry_participation (id, church_id, ministry_id, event_id) VALUES ($1, $2, $3, $4)',
    [ids.participation, ids.church, ids.kids, ids.event],
  );
  await scratch.query(
    `INSERT INTO shift (id, church_id, participation_id, event_time_block_id, start_time, end_time) VALUES
      ($1, $3, $4, $5, '2026-11-08T09:00Z', '2026-11-08T10:00Z'),
      ($2, $3, $4, $5, '2026-11-08T10:00Z', '2026-11-08T11:00Z')`,
    [ids.firstShift, ids.secondShift, ids.church, ids.participation, ids.block],
  );
  await scratch.query(
    `INSERT INTO shift_requirement (id, church_id, participation_id, shift_id, role_id, sector_id, people_needed) VALUES
      ($1, $5, $6, $7, $8, $9, 1), ($2, $5, $6, $7, $8, $10, 1),
      ($3, $5, $6, $11, $8, $12, 1), ($4, $5, $6, $11, $8, $13, 1)`,
    [
      ids.teacherAtZebra,
      ids.teacherAtAlpha,
      ids.tieWinner,
      ids.tieLoser,
      ids.church,
      ids.participation,
      ids.firstShift,
      ids.teacher,
      ids.zebra,
      ids.alpha,
      ids.secondShift,
      ids.tieKids,
      ids.tieWorship,
    ],
  );
  await scratch.query(
    `INSERT INTO "user" (id, name, email) VALUES
      ('migration-user-1', 'Migration User 1', 'migration-user-1@example.test'),
      ('migration-user-2', 'Migration User 2', 'migration-user-2@example.test'),
      ('migration-user-3', 'Migration User 3', 'migration-user-3@example.test')`,
  );
  await scratch.query(
    `INSERT INTO volunteer (id, church_id, user_id) VALUES
      ('20000000-0000-4000-8000-000000000101', $1, 'migration-user-1'),
      ('20000000-0000-4000-8000-000000000102', $1, 'migration-user-2'),
      ('20000000-0000-4000-8000-000000000103', $1, 'migration-user-3')`,
    [ids.church],
  );
  await scratch.query(
    `INSERT INTO assignment (id, church_id, participation_id, shift_id, volunteer_id, role_id) VALUES
      ($1, $4, $5, $6, '20000000-0000-4000-8000-000000000101', $8),
      ($2, $4, $5, $7, '20000000-0000-4000-8000-000000000102', $8),
      ($3, $4, $5, $6, '20000000-0000-4000-8000-000000000103', $9)`,
    [
      ids.matchedAssignment,
      ids.tiedAssignment,
      ids.unmatchedAssignment,
      ids.church,
      ids.participation,
      ids.firstShift,
      ids.secondShift,
      ids.teacher,
      ids.helper,
    ],
  );
}

describe('assignment ShiftRequirement migration', () => {
  beforeAll(async () => {
    const urls = migrationUrls();
    admin = new pg.Client({ connectionString: urls.admin });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${scratchName}`);
    scratch = new pg.Client({ connectionString: urls.scratch });
    await scratch.connect();

    migrationsBeforeAssignmentRequirement = mkdtempSync(
      join(tmpdir(), 'assignment-requirement-migration-'),
    );
    cpSync(MIGRATIONS, migrationsBeforeAssignmentRequirement, {
      recursive: true,
    });
    const journalPath = join(
      migrationsBeforeAssignmentRequirement,
      'meta/_journal.json',
    );
    const journal = JSON.parse(
      readFileSync(journalPath, 'utf8'),
    ) as MigrationJournal;
    const migrationIndex = journal.entries.findIndex(
      ({ tag }) => tag === MIGRATION_TAG,
    );
    if (migrationIndex < 0)
      throw new Error(`Missing migration: ${MIGRATION_TAG}`);
    journal.entries = journal.entries.slice(0, migrationIndex);
    writeFileSync(journalPath, JSON.stringify(journal));

    await migrate(drizzle(scratch), {
      migrationsFolder: migrationsBeforeAssignmentRequirement,
    });
    await seedPreMigrationAssignments();
    await migrate(drizzle(scratch), { migrationsFolder: MIGRATIONS });
  }, 60_000);

  afterAll(async () => {
    await scratch.end();
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
    await admin.end();
    rmSync(migrationsBeforeAssignmentRequirement, {
      recursive: true,
      force: true,
    });
  });

  it('backfills by Sector name, breaks name ties by requirement id, and deletes unmatched rows', async () => {
    const result = await scratch.query(
      'SELECT id, shift_requirement_id AS "shiftRequirementId" FROM assignment ORDER BY id',
    );
    expect(result.rows).toEqual([
      {
        id: ids.matchedAssignment,
        shiftRequirementId: ids.teacherAtAlpha,
      },
      { id: ids.tiedAssignment, shiftRequirementId: ids.tieWinner },
    ]);

    const unmatched = await scratch.query(
      'SELECT id FROM assignment WHERE id = $1',
      [ids.unmatchedAssignment],
    );
    expect(unmatched.rows).toEqual([]);
  });

  it('enforces the final binding and cascades requirement deletion', async () => {
    const column = await scratch.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'assignment' AND column_name = 'shift_requirement_id'`,
    );
    expect(column.rows[0]?.is_nullable).toBe('NO');

    await scratch.query('DELETE FROM shift_requirement WHERE id = $1', [
      ids.teacherAtAlpha,
    ]);
    const assignmentRow = await scratch.query(
      'SELECT id FROM assignment WHERE id = $1',
      [ids.matchedAssignment],
    );
    expect(assignmentRow.rows).toEqual([]);
  });
});
