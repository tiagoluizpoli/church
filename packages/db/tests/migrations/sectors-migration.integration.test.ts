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
const SECTORS_TAG = '0020_sectors';
const scratchName = `church_sectors_migration_${process.pid}`;

const ids = {
  church: '10000000-0000-4000-8000-000000000001',
  kids: '10000000-0000-4000-8000-0000000000a1',
  worship: '10000000-0000-4000-8000-0000000000a2',
  idle: '10000000-0000-4000-8000-0000000000a3',
  teacher: '10000000-0000-4000-8000-0000000000b1',
  helper: '10000000-0000-4000-8000-0000000000b2',
  singer: '10000000-0000-4000-8000-0000000000b3',
  teamA: '10000000-0000-4000-8000-0000000000c1',
  teamB: '10000000-0000-4000-8000-0000000000c2',
  cycle: '10000000-0000-4000-8000-0000000000d1',
  event: '10000000-0000-4000-8000-0000000000d2',
  block: '10000000-0000-4000-8000-0000000000d3',
  participation: '10000000-0000-4000-8000-0000000000d4',
  shift: '10000000-0000-4000-8000-0000000000d5',
  template: '10000000-0000-4000-8000-0000000000e1',
  templateBlock: '10000000-0000-4000-8000-0000000000e2',
};

let admin: pg.Client;
let scratch: pg.Client;
let folder: string;

function adminUrl(): { admin: string; scratch: string } {
  const url = new URL(getIntegrationDatabaseUrl());
  const scratchUrl = new URL(url);
  url.pathname = '/postgres';
  scratchUrl.pathname = `/${scratchName}`;
  return { admin: url.toString(), scratch: scratchUrl.toString() };
}

/** Migrates a scratch database up to (not including) 0020, then seeds pre-0020 rows. */
async function seedBeforeSectors() {
  await scratch.query(
    `INSERT INTO organization (id, name, slug, created_at) VALUES ($1, 'Church', 'church', now())`,
    [ids.church],
  );
  await scratch.query('INSERT INTO church (id) VALUES ($1)', [ids.church]);
  for (const [id, name] of [
    [ids.kids, 'Kids'],
    [ids.worship, 'Worship'],
    [ids.idle, 'Idle'],
  ]) {
    await scratch.query(
      'INSERT INTO ministry (id, church_id, name) VALUES ($1, $2, $3)',
      [id, ids.church, name],
    );
  }
  for (const [id, ministry, name] of [
    [ids.teacher, ids.kids, 'Teacher'],
    [ids.helper, ids.kids, 'Helper'],
    [ids.singer, ids.worship, 'Singer'],
  ]) {
    await scratch.query(
      'INSERT INTO role (id, church_id, ministry_id, name) VALUES ($1, $2, $3, $4)',
      [id, ids.church, ministry, name],
    );
  }
  for (const [id, name] of [
    [ids.teamA, 'Team A'],
    [ids.teamB, 'Team B'],
  ]) {
    await scratch.query(
      'INSERT INTO team (id, church_id, ministry_id, name) VALUES ($1, $2, $3, $4)',
      [id, ids.church, ids.kids, name],
    );
  }
  await scratch.query(
    `INSERT INTO cycle (id, church_id, name, start_date, end_date) VALUES ($1, $2, 'Cycle', '2026-11-01', '2026-12-01')`,
    [ids.cycle, ids.church],
  );
  await scratch.query(
    `INSERT INTO event (id, church_id, cycle_id, title, start, "end") VALUES ($1, $2, $3, 'Service', '2026-11-08T09:00Z', '2026-11-08T11:00Z')`,
    [ids.event, ids.church, ids.cycle],
  );
  await scratch.query(
    `INSERT INTO event_time_block (id, church_id, event_id, start_time, end_time) VALUES ($1, $2, $3, '2026-11-08T09:00Z', '2026-11-08T11:00Z')`,
    [ids.block, ids.church, ids.event],
  );
  await scratch.query(
    'INSERT INTO ministry_participation (id, church_id, ministry_id, event_id) VALUES ($1, $2, $3, $4)',
    [ids.participation, ids.church, ids.kids, ids.event],
  );
  await scratch.query(
    `INSERT INTO shift (id, church_id, participation_id, event_time_block_id, start_time, end_time) VALUES ($1, $2, $3, $4, '2026-11-08T09:00Z', '2026-11-08T10:00Z')`,
    [ids.shift, ids.church, ids.participation, ids.block],
  );
  // Teacher is split by Team (2 + 3); Helper has one Team-less row.
  for (const [role, team, people] of [
    [ids.teacher, ids.teamA, 2],
    [ids.teacher, ids.teamB, 3],
    [ids.helper, null, 1],
  ]) {
    await scratch.query(
      'INSERT INTO shift_requirement (church_id, participation_id, shift_id, role_id, team_id, people_needed) VALUES ($1, $2, $3, $4, $5, $6)',
      [ids.church, ids.participation, ids.shift, role, team, people],
    );
  }
  await scratch.query(
    `INSERT INTO event_template (id, church_id, name, weekday) VALUES ($1, $2, 'Template', 0)`,
    [ids.template, ids.church],
  );
  await scratch.query(
    `INSERT INTO template_time_block (id, church_id, template_id, label, start_time, end_time, "order") VALUES ($1, $2, $3, 'Welcome', '09:00', '09:30', 0)`,
    [ids.templateBlock, ids.church, ids.template],
  );
  // Worship's Singer is split by Team in the Usual setup (1 + 2) plus a Team-less 4.
  await scratch.query(
    `INSERT INTO usual_setup (church_id, ministry_id, source_template_time_block_id, shift_split, headcounts) VALUES ($1, $2, $3, '{"kind":"equal","count":1}', $4)`,
    [
      ids.church,
      ids.worship,
      ids.templateBlock,
      JSON.stringify([
        { roleId: ids.singer, teamId: ids.teamA, peopleNeeded: 1 },
        { roleId: ids.singer, peopleNeeded: 2 },
        { roleId: ids.helper, peopleNeeded: 4 },
      ]),
    ],
  );
}

beforeAll(async () => {
  const urls = adminUrl();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before 0020.
  folder = mkdtempSync(join(tmpdir(), 'sectors-migration-'));
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const migrationIndex = journal.entries.findIndex(
    (entry: { tag: string }) => entry.tag === SECTORS_TAG,
  );
  if (migrationIndex < 0) throw new Error(`Missing migration: ${SECTORS_TAG}`);
  journal.entries = journal.entries.slice(0, migrationIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(drizzle(scratch), { migrationsFolder: folder });

  await seedBeforeSectors();
  for (const statement of readFileSync(
    join(MIGRATIONS, `${SECTORS_TAG}.sql`),
    'utf8',
  ).split('--> statement-breakpoint')) {
    await scratch.query(statement);
  }
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe('migration 0020 (Sectors)', () => {
  it('creates one Geral Sector for each Ministry that needs headcounts', async () => {
    const { rows } = await scratch.query(
      'SELECT ministry_id AS "ministryId", name FROM sector ORDER BY ministry_id',
    );

    expect(rows).toEqual([
      { ministryId: ids.kids, name: 'Geral' },
      { ministryId: ids.worship, name: 'Geral' },
    ]);
  });

  it('merges Team-split requirements into one row per shift and role, bound to Geral', async () => {
    const { rows } = await scratch.query(
      `SELECT r.role_id AS "roleId", r.people_needed AS "peopleNeeded", s.name AS "sectorName", s.ministry_id AS "ministryId"
       FROM shift_requirement r INNER JOIN sector s ON s.id = r.sector_id
       ORDER BY r.role_id`,
    );

    expect(rows).toEqual(
      [
        {
          roleId: ids.teacher,
          peopleNeeded: 5,
          sectorName: 'Geral',
          ministryId: ids.kids,
        },
        {
          roleId: ids.helper,
          peopleNeeded: 1,
          sectorName: 'Geral',
          ministryId: ids.kids,
        },
      ].sort((a, b) => a.roleId.localeCompare(b.roleId)),
    );
  });

  it('makes sector_id NOT NULL and drops team_id', async () => {
    const { rows } = await scratch.query(
      `SELECT column_name AS "columnName", is_nullable AS "isNullable" FROM information_schema.columns
       WHERE table_name = 'shift_requirement' AND column_name IN ('sector_id', 'team_id')`,
    );

    expect(rows).toEqual([{ columnName: 'sector_id', isNullable: 'NO' }]);
  });

  it('rewrites Usual setup headcounts to Sector items summed by Role', async () => {
    const { rows: sectors } = await scratch.query(
      'SELECT id FROM sector WHERE ministry_id = $1',
      [ids.worship],
    );
    const { rows } = await scratch.query('SELECT headcounts FROM usual_setup');

    expect(rows).toEqual([
      {
        headcounts: [
          { sectorId: sectors[0].id, roleId: ids.singer, peopleNeeded: 3 },
          { sectorId: sectors[0].id, roleId: ids.helper, peopleNeeded: 4 },
        ],
      },
    ]);
  });

  it('rejects a raw duplicate (shift, sector, role) insert', async () => {
    const { rows } = await scratch.query(
      'SELECT sector_id AS "sectorId" FROM shift_requirement WHERE role_id = $1',
      [ids.teacher],
    );

    await expect(
      scratch.query(
        'INSERT INTO shift_requirement (church_id, participation_id, shift_id, role_id, sector_id, people_needed) VALUES ($1, $2, $3, $4, $5, 1)',
        [
          ids.church,
          ids.participation,
          ids.shift,
          ids.teacher,
          rows[0].sectorId,
        ],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'shift_requirement_shift_sector_role_idx',
    });
  });
});
