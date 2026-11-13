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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runDeploymentPreflights } from '@/deployment-preflight';
import { getIntegrationDatabaseUrl } from '@/integration-database-url';

const MIGRATIONS = join(import.meta.dirname, '../src/migrations');
const LABEL_INDEX_MIGRATION = '0028_noisy_gunslinger';
const scratchName = `church_deployment_preflight_${process.pid}`;
const TEMPLATE_ID = '30000000-0000-4000-8000-0000000000a1';

const adminUrl = new URL(getIntegrationDatabaseUrl());
adminUrl.pathname = '/postgres';
const scratchUrl = new URL(adminUrl);
scratchUrl.pathname = `/${scratchName}`;
const databaseUrl = scratchUrl.toString();

let admin: pg.Client;
let beforeLabelIndex: string;

async function withScratch(
  work: (client: pg.Client) => Promise<unknown>,
): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

async function recreateScratch(): Promise<void> {
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
}

// Rows only exercise the label check, so foreign keys are not enforced here.
async function insertBlockLabels(labels: string[]): Promise<void> {
  await withScratch(async (client) => {
    await client.query('SET session_replication_role = replica');
    for (const [order, label] of labels.entries()) {
      await client.query(
        `INSERT INTO template_time_block (id, church_id, template_id, label, "order", start_time, end_time)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2, $3, '09:00', '10:00')`,
        [TEMPLATE_ID, label, order],
      );
    }
  });
}

const preflight = () =>
  runDeploymentPreflights({ databaseUrl, migrationsFolder: MIGRATIONS });

describe('deployment preflight for migration 0028', () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    beforeLabelIndex = mkdtempSync(join(tmpdir(), 'deployment-preflight-'));
    cpSync(MIGRATIONS, beforeLabelIndex, { recursive: true });
    const journalPath = join(beforeLabelIndex, 'meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ tag: string }>;
    };
    const index = journal.entries.findIndex(
      ({ tag }) => tag === LABEL_INDEX_MIGRATION,
    );
    journal.entries = journal.entries.slice(0, index);
    writeFileSync(journalPath, JSON.stringify(journal));
  });

  beforeEach(recreateScratch);

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
    await admin.end();
    rmSync(beforeLabelIndex, { recursive: true, force: true });
  });

  it('passes a new empty database', async () => {
    await expect(preflight()).resolves.toEqual([
      `${LABEL_INDEX_MIGRATION} pending on an empty schema.`,
    ]);
  });

  it('stops a pending 0028 while labels collide, without changing data', async () => {
    await withScratch((client) =>
      migrate(drizzle(client), { migrationsFolder: beforeLabelIndex }),
    );
    await insertBlockLabels(['Morning', 'morning', 'Evening']);

    await expect(preflight()).rejects.toThrow(`templates ${TEMPLATE_ID} (2)`);
    await withScratch(async (client) => {
      const { rows } = await client.query(
        'SELECT label FROM template_time_block ORDER BY "order"',
      );
      expect(rows.map(({ label }) => label)).toEqual([
        'Morning',
        'morning',
        'Evening',
      ]);
    });
  });

  it('passes a pending 0028 without collisions', async () => {
    await withScratch((client) =>
      migrate(drizzle(client), { migrationsFolder: beforeLabelIndex }),
    );
    await insertBlockLabels(['Morning', 'Evening']);

    await expect(preflight()).resolves.toEqual([
      `${LABEL_INDEX_MIGRATION} pending; no label collisions.`,
    ]);
  });

  it('skips the check once 0028 is applied', async () => {
    await withScratch((client) =>
      migrate(drizzle(client), { migrationsFolder: MIGRATIONS }),
    );

    await expect(preflight()).resolves.toEqual([
      `${LABEL_INDEX_MIGRATION} already applied; no preflight.`,
    ]);
  });
}, 120_000);
