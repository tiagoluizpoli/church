import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { isIntegrationWorkerDatabaseName } from '@/integration-worker-database-name';
import { worktreeOrUnspecified } from '@/purpose-database-url-guard';

const runUrl = new URL(process.env.DATABASE_URL ?? '');
const templateUrl = new URL(runUrl);
templateUrl.pathname = `/church_${worktreeOrUnspecified()}_int`;
const PROBE_TABLE = 'per_run_isolation_probe';

describe('per-run integration database', () => {
  const run = new pg.Client({ connectionString: runUrl.toString() });
  const template = new pg.Client({ connectionString: templateUrl.toString() });

  afterAll(async () => {
    await run.query(`drop table if exists ${PROBE_TABLE}`).catch(() => {});
    await run.end().catch(() => {});
    await template.end().catch(() => {});
  });

  it('runs on a clone named like a worker database, not the shared one', () => {
    const database = runUrl.pathname.slice(1);

    expect(database).not.toBe(templateUrl.pathname.slice(1));
    expect(
      isIntegrationWorkerDatabaseName({
        database,
        worktree: worktreeOrUnspecified(),
      }),
    ).toBe(true);
  });

  it('leaves the shared database untouched by writes in the run', async () => {
    await run.connect();
    await template.connect();
    await run.query(`create table ${PROBE_TABLE} (id int)`);

    const found = await template.query(
      'select 1 from pg_tables where tablename = $1',
      [PROBE_TABLE],
    );

    expect(found.rowCount).toBe(0);
  });
});
