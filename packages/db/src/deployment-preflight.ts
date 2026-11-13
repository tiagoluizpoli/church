import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Migration-specific checks a deployment runs before `drizzle-kit migrate`
 * (docs/agents/backend.md). Each check runs only while its migration is
 * still pending on the target, and only reads. A failed check stops the
 * deployment before any migration runs; historical migrations stay as written.
 */

const LABEL_INDEX_MIGRATION = '0028_noisy_gunslinger';

const LABEL_COLLISIONS_SQL = `
  SELECT template_id AS "templateId", count(*)::int AS duplicates
  FROM template_time_block
  GROUP BY template_id, lower(label)
  HAVING count(*) > 1
  ORDER BY template_id`;

interface JournalEntry {
  tag: string;
  when: number;
}

export interface DeploymentPreflightInput {
  databaseUrl: string;
  migrationsFolder: string;
}

export class DeploymentPreflightFailure extends Error {}

function migrationTimestamp(input: DeploymentPreflightInput): number {
  const journalPath = join(input.migrationsFolder, 'meta/_journal.json');
  const { entries } = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };
  const entry = entries.find(({ tag }) => tag === LABEL_INDEX_MIGRATION);
  if (!entry) {
    throw new DeploymentPreflightFailure(
      `Migration journal has no ${LABEL_INDEX_MIGRATION}.`,
    );
  }
  return entry.when;
}

// drizzle-kit applies every journal entry newer than the last recorded one.
async function lastAppliedMigration(client: pg.Client): Promise<number> {
  const ledger = await client.query<{ present: boolean }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`,
  );
  if (ledger.rows[0]?.present !== true) return 0;
  const { rows } = await client.query<{ last: string | null }>(
    'SELECT max(created_at)::text AS last FROM drizzle.__drizzle_migrations',
  );
  const last = rows[0]?.last;
  return last ? Number(last) : 0;
}

async function tableExists(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public.template_time_block') IS NOT NULL AS present`,
  );
  return rows[0]?.present === true;
}

export async function runDeploymentPreflights(
  input: DeploymentPreflightInput,
): Promise<string[]> {
  const labelIndexWhen = migrationTimestamp(input);
  const client = new pg.Client({ connectionString: input.databaseUrl });
  await client.connect();
  try {
    const lastApplied = await lastAppliedMigration(client);
    if (lastApplied >= labelIndexWhen) {
      return [`${LABEL_INDEX_MIGRATION} already applied; no preflight.`];
    }
    const hasBlocks = await tableExists(client);
    if (!hasBlocks) {
      return [`${LABEL_INDEX_MIGRATION} pending on an empty schema.`];
    }
    const { rows } = await client.query<{
      templateId: string;
      duplicates: number;
    }>(LABEL_COLLISIONS_SQL);
    if (rows.length > 0) {
      const templates = rows
        .map((row) => `${row.templateId} (${row.duplicates})`)
        .join(', ');
      throw new DeploymentPreflightFailure(
        `${LABEL_INDEX_MIGRATION} is pending and TemplateTimeBlock labels collide case-insensitively in templates ${templates}. ` +
          'Stop: get an owner-approved, row-specific label fix (docs/agents/backend.md), then deploy again.',
      );
    }
    return [`${LABEL_INDEX_MIGRATION} pending; no label collisions.`];
  } finally {
    await client.end();
  }
}
