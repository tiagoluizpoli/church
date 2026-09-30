import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { fromDate, today } from '@church/time';
import { verifyPassword } from 'better-auth/crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_PERSONA_PASSWORD } from '../../seeds/blueprints/credentials';
import { DEVELOPMENT_CHURCH_TIMEZONE } from '../../seeds/blueprints/development';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESEED_COMMAND = join(
  SERVER_ROOT,
  'seeds',
  'development',
  'reseed-dev.ts',
);
const SCRATCH_WORKTREE = 'reseed_dev_command';
const SCRATCH_DATABASE = `church_${SCRATCH_WORKTREE}_dev`;
const SCRATCH_E2E_DATABASE = `church_${SCRATCH_WORKTREE}_e2e`;
const OTHER_WORKTREE_DATABASE = 'church_reseed_dev_other_dev';
const SENTINEL_TABLE = 'reseed_dev_sentinel';
const PHASE_LINES = [
  '[1/4] reset: ok',
  '[2/4] migrate: ok',
  '[3/4] load: ok',
  '[4/4] verify: ok',
];
/** Stamped from the clock at load time, so they differ between reseeds. */
const TIME_DERIVED_OR_AUDIT_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'expires_at',
  'joined_at',
]);

const integrationDatabaseUrl = getIntegrationDatabaseUrl();

interface DatabaseUrlForInput {
  database: string;
  host?: string;
}

function databaseUrlFor({ database, host }: DatabaseUrlForInput): string {
  const url = new URL(integrationDatabaseUrl);
  url.pathname = `/${database}`;
  url.search = '';
  if (host) url.hostname = host;
  return url.toString();
}

const credentials = (() => {
  const url = new URL(integrationDatabaseUrl);
  return `${url.username}:${url.password}`;
})();

interface RunReseedInput {
  databaseUrl: string;
  args?: string[];
  nodeEnv?: string;
  worktree?: string;
}

interface RunReseedResult {
  status: number | null;
  output: string;
}

function runReseed({
  databaseUrl,
  args = [],
  nodeEnv = 'development',
  worktree = SCRATCH_WORKTREE,
}: RunReseedInput): RunReseedResult {
  const result = spawnSync('bun', [RESEED_COMMAND, ...args], {
    cwd: SERVER_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHURCH_EXEC_PURPOSE: 'development',
      CHURCH_WORKTREE: worktree,
      DATABASE_URL: databaseUrl,
      NODE_ENV: nodeEnv,
    },
  });

  return { status: result.status, output: result.stdout + result.stderr };
}

const adminPool = new pg.Pool({
  connectionString: databaseUrlFor({ database: 'postgres' }),
  max: 1,
});

interface DatabaseInput {
  database: string;
}

async function recreateDatabase({ database }: DatabaseInput): Promise<void> {
  await adminPool.query(`drop database if exists "${database}" with (force)`);
  await adminPool.query(`create database "${database}"`);
}

interface WithDatabaseInput<T> extends DatabaseInput {
  use: (pool: pg.Pool) => Promise<T>;
}

async function withDatabase<T>({
  database,
  use,
}: WithDatabaseInput<T>): Promise<T> {
  const pool = new pg.Pool({
    connectionString: databaseUrlFor({ database }),
    max: 1,
  });
  try {
    return await use(pool);
  } finally {
    await pool.end();
  }
}

async function plantSentinel({ database }: DatabaseInput): Promise<void> {
  await withDatabase({
    database,
    use: (pool) =>
      pool.query(`create table if not exists ${SENTINEL_TABLE} (id int)`),
  });
}

interface HasTableInput extends DatabaseInput {
  table: string;
}

async function hasTable({ database, table }: HasTableInput): Promise<boolean> {
  return await withDatabase({
    database,
    use: async (pool) => {
      const result = await pool.query(
        'select 1 from pg_tables where schemaname = $1 and tablename = $2',
        ['public', table],
      );
      return result.rowCount === 1;
    },
  });
}

interface PublicTableRow {
  tablename: string;
}

type GraphSnapshot = Record<string, string[]>;

interface VerifiesPasswordInput {
  hash: string;
}

/**
 * Every row of every application table, minus the columns the clock stamps.
 * The salted credential hash differs per hash by design, so it is compared by
 * whether it still verifies the development password — once per distinct
 * hash, since every persona shares one and hashing is deliberately slow.
 */
async function snapshotGraph({
  database,
}: DatabaseInput): Promise<GraphSnapshot> {
  return await withDatabase({
    database,
    use: async (pool) => {
      const tables = await pool.query<PublicTableRow>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      );
      const snapshot: GraphSnapshot = {};
      const verifiedByHash = new Map<string, boolean>();
      const verifiesPassword = async ({
        hash,
      }: VerifiesPasswordInput): Promise<boolean> => {
        const known = verifiedByHash.get(hash);
        if (known !== undefined) return known;
        const verified = await verifyPassword({
          hash,
          password: SEED_PERSONA_PASSWORD,
        });
        verifiedByHash.set(hash, verified);
        return verified;
      };

      for (const { tablename } of tables.rows) {
        const rows = await pool.query<Record<string, unknown>>(
          `select * from "${tablename}"`,
        );
        if (rows.rowCount === 0) continue;

        const normalized: string[] = [];
        for (const row of rows.rows) {
          const kept: Record<string, unknown> = {};
          for (const [column, value] of Object.entries(row)) {
            if (TIME_DERIVED_OR_AUDIT_COLUMNS.has(column)) continue;
            kept[column] =
              tablename === 'account' && column === 'password'
                ? await verifiesPassword({ hash: String(value) })
                : value;
          }
          normalized.push(JSON.stringify(kept));
        }
        snapshot[tablename] = normalized.sort();
      }

      return snapshot;
    },
  });
}

function currentChurchDay(): string {
  return today({
    instant: fromDate({ date: new Date() }),
    timeZone: DEVELOPMENT_CHURCH_TIMEZONE,
  });
}

describe('db:reseed:dev command', () => {
  beforeAll(async () => {
    for (const database of [
      SCRATCH_DATABASE,
      SCRATCH_E2E_DATABASE,
      OTHER_WORKTREE_DATABASE,
    ]) {
      await recreateDatabase({ database });
      await plantSentinel({ database });
    }
  });

  afterAll(async () => {
    for (const database of [
      SCRATCH_DATABASE,
      SCRATCH_E2E_DATABASE,
      OTHER_WORKTREE_DATABASE,
    ]) {
      await adminPool.query(
        `drop database if exists "${database}" with (force)`,
      );
    }
    await adminPool.end();
  });

  it('rebuilds the worktree development database after a redacted preflight, the same way twice', async () => {
    const databaseUrl = databaseUrlFor({ database: SCRATCH_DATABASE });

    const first = runReseed({ databaseUrl, args: ['--anchor=2026-03-15'] });
    expect(first.status, first.output).toBe(0);
    const firstGraph = await snapshotGraph({ database: SCRATCH_DATABASE });

    const second = runReseed({ databaseUrl, args: ['--anchor=2026-03-15'] });
    expect(second.status, second.output).toBe(0);
    const secondGraph = await snapshotGraph({ database: SCRATCH_DATABASE });

    expect(first.output).toContain(
      `purpose=development worktree=${SCRATCH_WORKTREE}`,
    );
    expect(first.output).toContain(`database=${SCRATCH_DATABASE}`);
    expect(first.output).not.toContain(credentials);
    expect(first.output).toContain(
      `anchor=2026-03-15 timeZone=${DEVELOPMENT_CHURCH_TIMEZONE}`,
    );
    const phaseOrder = PHASE_LINES.map((line) => first.output.indexOf(line));
    expect(phaseOrder.every((index) => index >= 0)).toBe(true);
    expect(phaseOrder).toEqual([...phaseOrder].sort((a, b) => a - b));
    expect(first.output.indexOf('purpose=development')).toBeLessThan(
      phaseOrder[0] ?? -1,
    );
    expect(first.output).toContain('db:reseed:dev complete');
    expect(first.output).not.toContain('Redemption path');

    expect(
      await hasTable({ database: SCRATCH_DATABASE, table: SENTINEL_TABLE }),
    ).toBe(false);
    expect(Object.keys(firstGraph)).toEqual(
      expect.arrayContaining(['organization', 'user', 'account', 'volunteer']),
    );
    expect(secondGraph).toEqual(firstGraph);
  });

  it('defaults the anchor to today in the Church Timezone', () => {
    const before = currentChurchDay();
    const result = runReseed({
      databaseUrl: databaseUrlFor({ database: SCRATCH_DATABASE }),
    });
    const after = currentChurchDay();

    expect(result.status, result.output).toBe(0);
    const anchor = /anchor=(\d{4}-\d{2}-\d{2})/.exec(result.output)?.[1];
    expect([before, after]).toContain(anchor);
  });

  it('refuses an invalid anchor before resolving or resetting anything', async () => {
    await plantSentinel({ database: SCRATCH_DATABASE });

    const result = runReseed({
      databaseUrl: databaseUrlFor({ database: SCRATCH_DATABASE }),
      args: ['--anchor=2026-02-30'],
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('Invalid --anchor "2026-02-30"');
    expect(result.output).not.toContain('purpose=development');
    expect(result.output).not.toContain('[1/4]');
    expect(
      await hasTable({ database: SCRATCH_DATABASE, table: SENTINEL_TABLE }),
    ).toBe(true);
  });

  it.each([
    {
      label: 'the E2E database',
      database: SCRATCH_E2E_DATABASE,
      probe: SENTINEL_TABLE,
    },
    {
      label: "another worktree's development database",
      database: OTHER_WORKTREE_DATABASE,
      probe: SENTINEL_TABLE,
    },
    {
      label: 'the integration database',
      database: new URL(integrationDatabaseUrl).pathname.slice(1),
      probe: 'organization',
    },
  ])('refuses $label before any reset', async ({ database, probe }) => {
    const result = runReseed({ databaseUrl: databaseUrlFor({ database }) });

    expect(result.status).toBe(1);
    expect(result.output).toContain('db:reseed:dev refused the target');
    expect(result.output).not.toContain('[1/4]');
    expect(result.output).not.toContain(credentials);
    expect(await hasTable({ database, table: probe })).toBe(true);
  });

  it.each([
    {
      label: 'an unknown database',
      databaseUrl: databaseUrlFor({ database: 'postgres' }),
    },
    {
      label: 'a production-like remote host',
      databaseUrl: databaseUrlFor({
        database: SCRATCH_DATABASE,
        host: 'db.example.com',
      }),
    },
  ])('refuses $label before any reset', ({ databaseUrl }) => {
    const result = runReseed({ databaseUrl });

    expect(result.status).toBe(1);
    expect(result.output).toContain('db:reseed:dev refused the target');
    expect(result.output).not.toContain('[1/4]');
    expect(result.output).not.toContain(credentials);
  });

  it('refuses a production runtime before any reset', async () => {
    await plantSentinel({ database: SCRATCH_DATABASE });

    const result = runReseed({
      databaseUrl: databaseUrlFor({ database: SCRATCH_DATABASE }),
      nodeEnv: 'production',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('db:reseed:dev refused the target');
    expect(
      await hasTable({ database: SCRATCH_DATABASE, table: SENTINEL_TABLE }),
    ).toBe(true);
  });

  it('names the phase that failed and never reports success', () => {
    // A correctly named target whose database was never provisioned passes
    // every refusal check, then fails on the first connection: the reset.
    const result = runReseed({
      databaseUrl: databaseUrlFor({ database: 'church_reseed_dev_absent_dev' }),
      worktree: 'reseed_dev_absent',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('db:reseed:dev failed at phase "reset"');
    expect(result.output).not.toContain('db:reseed:dev complete');
  });
});
