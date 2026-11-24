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
import { getIntegrationDatabaseUrl } from '@/integration-database-url';

const MIGRATIONS = join(import.meta.dirname, '../../src/migrations');
const MIGRATION_TAG = '0075_drop-confirmed-assignment-status';
const scratchName = `church_drop_confirmed_assignment_${process.pid}`;

const shift = '40000000-0000-4000-8000-0000000000b1';
const ref = '40000000-0000-4000-8000-0000000000c1';
const assignments = {
  draft: '40000000-0000-4000-8000-0000000000a1',
  pending: '40000000-0000-4000-8000-0000000000a2',
  confirmed: '40000000-0000-4000-8000-0000000000a3',
  cancelled: '40000000-0000-4000-8000-0000000000a4',
} as const;
const volunteerFor = (status: string) =>
  `40000000-0000-4000-8000-0000000000d${Object.keys(assignments).indexOf(status) + 1}`;

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

async function insertAssignment(
  id: string | null,
  volunteerId: string,
  status?: string,
) {
  // Foreign keys are off for this session: the test is about the status column only.
  await scratch.query(
    `INSERT INTO assignment (id, church_id, participation_id, shift_id, volunteer_id, role_id, shift_requirement_id, status)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $2, $3, $4, $2, $2, COALESCE($5::assignment_status, 'pending'))`,
    [id, ref, shift, volunteerId, status ?? null],
  );
}

beforeAll(async () => {
  const urls = scratchUrls();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before the enum change.
  folder = mkdtempSync(join(tmpdir(), 'drop-confirmed-assignment-'));
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

  await scratch.query('SET session_replication_role = replica');
  for (const [status, id] of Object.entries(assignments)) {
    await insertAssignment(id, volunteerFor(status), status);
  }

  for (const statement of readFileSync(
    join(MIGRATIONS, `${MIGRATION_TAG}.sql`),
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

describe(`migration ${MIGRATION_TAG}`, () => {
  it('maps confirmed to pending and keeps the other statuses', async () => {
    const { rows } = await scratch.query(
      'SELECT id, status FROM assignment ORDER BY id',
    );
    expect(rows).toEqual([
      { id: assignments.draft, status: 'draft' },
      { id: assignments.pending, status: 'pending' },
      { id: assignments.confirmed, status: 'pending' },
      { id: assignments.cancelled, status: 'cancelled' },
    ]);
  });

  it('leaves exactly draft, pending and cancelled in the enum', async () => {
    const { rows } = await scratch.query(
      'SELECT unnest(enum_range(NULL::assignment_status))::text AS value',
    );
    expect(rows.map((row) => row.value)).toEqual([
      'draft',
      'pending',
      'cancelled',
    ]);
  });

  it('defaults a new Assignment to pending', async () => {
    const volunteer = '40000000-0000-4000-8000-0000000000e1';
    await insertAssignment(null, volunteer);
    const { rows } = await scratch.query(
      'SELECT status FROM assignment WHERE volunteer_id = $1',
      [volunteer],
    );
    expect(rows).toEqual([{ status: 'pending' }]);
  });

  it('rejects confirmed', async () => {
    await expect(
      scratch.query(
        `UPDATE assignment SET status = 'confirmed' WHERE id = $1`,
        [assignments.draft],
      ),
    ).rejects.toThrow(/invalid input value for enum assignment_status/);
    const { rows } = await scratch.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'assignment_status_check'`,
    );
    expect(rows[0].def).toBe(
      "CHECK ((status = ANY (ARRAY['draft'::assignment_status, 'pending'::assignment_status, 'cancelled'::assignment_status])))",
    );
  });

  it('allows one draft or pending Assignment per Shift and Volunteer, cancelled excluded', async () => {
    await expect(
      insertAssignment(null, volunteerFor('confirmed'), 'pending'),
    ).rejects.toThrow(/assignment_shift_volunteer_idx/);
    await expect(
      insertAssignment(null, volunteerFor('draft'), 'pending'),
    ).rejects.toThrow(/assignment_shift_volunteer_idx/);
    await expect(
      insertAssignment(null, volunteerFor('cancelled'), 'pending'),
    ).resolves.toBeUndefined();
    await expect(
      insertAssignment(null, volunteerFor('cancelled'), 'cancelled'),
    ).resolves.toBeUndefined();
  });
});
