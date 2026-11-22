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
// The recurrence migration and the weekday drop that completes it.
const MIGRATION_TAGS = [
  '0058_event_template_recurrence',
  '0059_event_template_drop_weekday',
];
const scratchName = `church_template_recurrence_migration_${process.pid}`;

const ids = {
  church: '30000000-0000-4000-8000-000000000001',
  ministry: '30000000-0000-4000-8000-000000000002',
  sunday: '30000000-0000-4000-8000-0000000000b0',
  friday: '30000000-0000-4000-8000-0000000000b5',
  sundayBlock: '30000000-0000-4000-8000-0000000000c0',
  fridayBlock: '30000000-0000-4000-8000-0000000000c5',
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

async function applyMigrations() {
  for (const tag of MIGRATION_TAGS) {
    for (const statement of readFileSync(
      join(MIGRATIONS, `${tag}.sql`),
      'utf8',
    ).split('--> statement-breakpoint')) {
      await scratch.query(statement);
    }
  }
}

beforeAll(async () => {
  const urls = scratchUrls();
  admin = new pg.Client({ connectionString: urls.admin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  scratch = new pg.Client({ connectionString: urls.scratch });
  await scratch.connect();

  // A migrations copy whose journal stops before the recurrence migration.
  folder = mkdtempSync(join(tmpdir(), 'template-recurrence-migration-'));
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const index = journal.entries.findIndex(
    (entry: { tag: string }) => entry.tag === MIGRATION_TAGS[0],
  );
  if (index < 0) throw new Error(`Missing migration: ${MIGRATION_TAGS[0]}`);
  journal.entries = journal.entries.slice(0, index);
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
  for (const [template, block, name, weekday] of [
    [ids.sunday, ids.sundayBlock, 'Sunday', 0],
    [ids.friday, ids.fridayBlock, 'Friday', 5],
  ] as const) {
    await scratch.query(
      'INSERT INTO event_template (id, church_id, name, weekday) VALUES ($1, $2, $3, $4)',
      [template, ids.church, name, weekday],
    );
    await scratch.query(
      `INSERT INTO template_time_block (id, church_id, template_id, label, start_time, end_time, "order") VALUES ($1, $2, $3, 'Culto', '19:00', '21:00', 0)`,
      [block, ids.church, template],
    );
    await scratch.query(
      `INSERT INTO usual_setup (church_id, ministry_id, source_template_time_block_id, shift_split) VALUES ($1, $2, $3, '{"kind":"none"}')`,
      [ids.church, ids.ministry, block],
    );
  }
});

afterAll(async () => {
  await scratch?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin?.end();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe('migration to event template Recurrence', () => {
  it('makes each template weekly on its weekday and keeps blocks and UsualSetups', async () => {
    await applyMigrations();

    const templates = await scratch.query(
      'SELECT id, recurrence FROM event_template ORDER BY id',
    );
    expect(templates.rows).toEqual([
      { id: ids.sunday, recurrence: { kind: 'weekly', weekdays: [0] } },
      { id: ids.friday, recurrence: { kind: 'weekly', weekdays: [5] } },
    ]);

    const blocks = await scratch.query(
      'SELECT b.id, b.template_id AS "templateId", u.ministry_id AS "ministryId" FROM template_time_block b JOIN usual_setup u ON u.source_template_time_block_id = b.id ORDER BY b.id',
    );
    expect(blocks.rows).toEqual([
      {
        id: ids.sundayBlock,
        templateId: ids.sunday,
        ministryId: ids.ministry,
      },
      {
        id: ids.fridayBlock,
        templateId: ids.friday,
        ministryId: ids.ministry,
      },
    ]);

    const columns = await scratch.query(
      `SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'event_template' AND column_name IN ('weekday', 'recurrence')`,
    );
    expect(columns.rows).toEqual([{ name: 'recurrence' }]);
  });
});
