import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real backup command against a stand-in Dokploy API, so every
 * Dokploy answer (version, backup configuration, backup outcome) is controlled.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const API_KEY = 'dokploy-test-api-key';

interface DokployBackup {
  backupId: string;
  database: string;
  prefix: string;
  schedule: string;
  enabled: boolean;
  keepLatestCount: number | null;
  databaseType: string;
  backupType: string;
}

interface DokployState {
  version: string;
  backups: Record<string, DokployBackup>;
  manualBackup: () => Response;
}

interface RecordedRequest {
  path: string;
  body: string;
  apiKey: string | null;
}

let state: DokployState;
let requests: RecordedRequest[];
let server: ReturnType<typeof Bun.serve>;

function recoveryBackup(overrides: Partial<DokployBackup> = {}): DokployBackup {
  return {
    backupId: 'recovery-id',
    database: 'church_staging',
    prefix: 'staging/pre-deployment',
    schedule: '0 0 * * *',
    enabled: false,
    keepLatestCount: 5,
    databaseType: 'postgres',
    backupType: 'database',
    ...overrides,
  };
}

function scheduledBackup(
  overrides: Partial<DokployBackup> = {},
): DokployBackup {
  return {
    backupId: 'scheduled-id',
    database: 'church_production',
    prefix: 'production/scheduled',
    schedule: '30 3 * * *',
    enabled: true,
    keepLatestCount: 5,
    databaseType: 'postgres',
    backupType: 'database',
    ...overrides,
  };
}

beforeEach(() => {
  requests = [];
  state = {
    version: 'v0.31.2',
    backups: { 'recovery-id': recoveryBackup() },
    manualBackup: () => Response.json(true),
  };
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push({
        path: url.pathname,
        body: await request.text(),
        apiKey: request.headers.get('x-api-key'),
      });
      if (url.pathname === '/api/settings.getDokployVersion') {
        return Response.json(state.version);
      }
      if (url.pathname === '/api/backup.one') {
        const backup = state.backups[url.searchParams.get('backupId') ?? ''];
        return backup
          ? Response.json(backup)
          : Response.json({ message: 'Backup not found' }, { status: 404 });
      }
      if (url.pathname === '/api/backup.manualBackupPostgres') {
        return state.manualBackup();
      }
      return new Response('not found', { status: 404 });
    },
  });
});

afterEach(() => {
  server.stop(true);
});

// Async spawn: a synchronous one would block the stand-in server in this process.
async function runBackup(
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  const child = Bun.spawn(
    ['bun', '--no-env-file', 'tooling/deployment/backup.ts', ...args],
    {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env.PATH,
        DOKPLOY_URL: server.url.origin,
        DOKPLOY_API_KEY: API_KEY,
        CHURCH_BACKUP_ID: 'recovery-id',
        ...env,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}${stderr}` };
}

const CREATE_STAGING = [
  'create',
  '--environment=staging',
  '--database=church_staging',
];

function triggeredBackups() {
  return requests.filter((r) => r.path === '/api/backup.manualBackupPostgres');
}

describe('backup create', () => {
  it('starts the configured backup and succeeds only after Dokploy confirms it', async () => {
    const result = await runBackup(CREATE_STAGING);

    expect(result.output).toContain('staging/pre-deployment');
    expect(result.exitCode).toBe(0);
    expect(triggeredBackups()).toEqual([
      {
        path: '/api/backup.manualBackupPostgres',
        body: JSON.stringify({ backupId: 'recovery-id' }),
        apiKey: API_KEY,
      },
    ]);
  });

  it('fails with the Dokploy error when the backup fails', async () => {
    state.manualBackup = () =>
      Response.json(
        { message: 'pg_dump: connection refused' },
        { status: 400 },
      );

    const result = await runBackup(CREATE_STAGING);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('pg_dump: connection refused');
  });

  it('fails when the backup does not finish behind the proxy', async () => {
    state.manualBackup = () => new Response('Gateway Timeout', { status: 504 });

    expect((await runBackup(CREATE_STAGING)).exitCode).toBe(1);
  });

  it('fails when Dokploy answers without confirming success', async () => {
    state.manualBackup = () => Response.json(false);

    expect((await runBackup(CREATE_STAGING)).exitCode).toBe(1);
  });

  it.each([
    ['the Dokploy URL', { DOKPLOY_URL: undefined }],
    ['the Dokploy API key', { DOKPLOY_API_KEY: undefined }],
    ['the backup id', { CHURCH_BACKUP_ID: undefined }],
  ])('refuses before contacting Dokploy without %s', async (_, env) => {
    const result = await runBackup(CREATE_STAGING, env);

    expect(result.exitCode).not.toBe(0);
    expect(requests).toEqual([]);
  });

  it.each([
    ['no environment', ['create', '--database=church_staging']],
    [
      'an unknown environment',
      ['create', '--environment=qa', '--database=church_staging'],
    ],
    ['no database', ['create', '--environment=staging']],
  ])('refuses %s before contacting Dokploy', async (_, args) => {
    expect((await runBackup(args)).exitCode).not.toBe(0);
    expect(requests).toEqual([]);
  });

  it('refuses a Dokploy version whose failed backups can displace retained ones', async () => {
    state.version = 'v0.29.4';

    const result = await runBackup(CREATE_STAGING);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('0.30.0');
    expect(triggeredBackups()).toEqual([]);
  });

  it.each([
    ['another database', { database: 'church_production' }],
    ['another environment prefix', { prefix: 'production/pre-deployment' }],
    ['the scheduled pool prefix', { prefix: 'staging/scheduled' }],
    ['a prefix shared by both pools', { prefix: 'staging' }],
    ['a different retention count', { keepLatestCount: 10 }],
    ['no retention count', { keepLatestCount: null }],
    ['an enabled schedule', { enabled: true }],
    ['a non-Postgres backup', { databaseType: 'mysql' }],
  ])('refuses a backup configuration with %s and starts nothing', async (_, overrides) => {
    state.backups['recovery-id'] = recoveryBackup(overrides);

    expect((await runBackup(CREATE_STAGING)).exitCode).toBe(1);
    expect(triggeredBackups()).toEqual([]);
  });

  it('accepts the configured prefix with surrounding slashes, as Dokploy normalizes it', async () => {
    state.backups['recovery-id'] = recoveryBackup({
      prefix: '/staging/pre-deployment/',
    });

    expect((await runBackup(CREATE_STAGING)).exitCode).toBe(0);
  });

  it('fails when the backup id is unknown to Dokploy', async () => {
    const result = await runBackup(CREATE_STAGING, {
      CHURCH_BACKUP_ID: 'missing-id',
    });

    expect(result.exitCode).toBe(1);
    expect(triggeredBackups()).toEqual([]);
  });

  it('never prints the API key', async () => {
    state.manualBackup = () =>
      Response.json({ message: 'boom' }, { status: 500 });

    expect((await runBackup(CREATE_STAGING)).output).not.toContain(API_KEY);
  });
});

describe('backup check', () => {
  const CHECK_PRODUCTION = [
    'check',
    '--environment=production',
    '--database=church_production',
  ];

  beforeEach(() => {
    state.backups = {
      'recovery-id': recoveryBackup({
        database: 'church_production',
        prefix: 'production/pre-deployment',
      }),
      'scheduled-id': scheduledBackup(),
    };
  });

  it('accepts production with a daily scheduled pool beside the recovery pool', async () => {
    const result = await runBackup(CHECK_PRODUCTION, {
      CHURCH_SCHEDULED_BACKUP_ID: 'scheduled-id',
    });

    expect(result.output).toContain('production/scheduled');
    expect(result.exitCode).toBe(0);
    expect(triggeredBackups()).toEqual([]);
  });

  it('requires a scheduled backup for production', async () => {
    expect((await runBackup(CHECK_PRODUCTION)).exitCode).toBe(1);
  });

  it.each([
    ['not daily', { schedule: '0 */6 * * *' }],
    ['disabled', { enabled: false }],
    ['in the recovery pool prefix', { prefix: 'production/pre-deployment' }],
    ['keeping another count', { keepLatestCount: 7 }],
  ])('refuses a production scheduled backup that is %s', async (_, overrides) => {
    state.backups['scheduled-id'] = scheduledBackup(overrides);

    const result = await runBackup(CHECK_PRODUCTION, {
      CHURCH_SCHEDULED_BACKUP_ID: 'scheduled-id',
    });

    expect(result.exitCode).toBe(1);
  });

  it('refuses a scheduled cadence outside production', async () => {
    const result = await runBackup(
      ['check', '--environment=staging', '--database=church_staging'],
      { CHURCH_SCHEDULED_BACKUP_ID: 'scheduled-id' },
    );

    expect(result.exitCode).toBe(1);
  });

  it('accepts a non-production environment with only the recovery pool', async () => {
    state.backups['recovery-id'] = recoveryBackup();

    const result = await runBackup([
      'check',
      '--environment=staging',
      '--database=church_staging',
    ]);

    expect(result.exitCode).toBe(0);
  });
});
