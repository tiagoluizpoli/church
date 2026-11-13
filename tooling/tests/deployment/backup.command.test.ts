import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real backup command against a stand-in Dokploy API, so every
 * Dokploy answer (version, backup configuration, backup outcome) is controlled.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const API_KEY = 'dokploy-test-api-key';
const S3_SECRET = 'synthetic-s3-secret-value';
const S3_FLAGS = `--s3-access-key-id synthetic-key --s3-secret-access-key ${S3_SECRET}`;

interface DokployBackup {
  backupId: string;
  database: string;
  prefix: string;
  schedule: string;
  enabled: boolean;
  keepLatestCount: number | null;
  databaseType: string;
  backupType: string;
  destinationId: string;
  postgres: { appName: string; serverId: string | null } | null;
}

interface DokployState {
  version: string;
  backups: Record<string, DokployBackup>;
  manualBackup: () => Response;
  // Backup files per listed folder (`<app>/<prefix>/`), as Dokploy lists them.
  poolFiles: Record<string, number>;
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
    keepLatestCount: null,
    databaseType: 'postgres',
    backupType: 'database',
    destinationId: 'homelab-s3',
    postgres: { appName: 'church-postgres', serverId: null },
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
    keepLatestCount: null,
    databaseType: 'postgres',
    backupType: 'database',
    destinationId: 'homelab-s3',
    postgres: { appName: 'church-postgres', serverId: null },
    ...overrides,
  };
}

// Dokploy's rclone lsjson rows for a folder: its backups plus a subfolder.
function poolListing(search: string) {
  const count = state.poolFiles[search] ?? 0;
  const files = Array.from({ length: count }, (_, index) => ({
    Path: `${search}2026-11-0${index + 1}T03-00-00-000Z.sql.gz`,
    Name: `2026-11-0${index + 1}T03-00-00-000Z.sql.gz`,
    Size: 4096,
    IsDir: false,
  }));
  return [
    ...files,
    { Path: `${search}old`, Name: 'old', Size: 0, IsDir: true },
  ];
}

beforeEach(() => {
  requests = [];
  state = {
    version: 'v0.31.2',
    backups: { 'recovery-id': recoveryBackup() },
    manualBackup: () => Response.json(true),
    poolFiles: {
      'church-postgres/staging/pre-deployment/': 5,
      'church-postgres/production/pre-deployment/': 5,
      'church-postgres/production/scheduled/': 5,
    },
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
      if (url.pathname === '/api/backup.listBackupFiles') {
        const search = url.searchParams.get('search') ?? '';
        if (url.searchParams.get('destinationId') !== 'homelab-s3') {
          return Response.json([]);
        }
        return Response.json(poolListing(search));
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

  // Dokploy 0.30.0 forwards the failed backup shell command, S3 flags included.
  it.each([
    [
      'a JSON message',
      () =>
        Response.json(
          { message: `Command failed: rclone rcat ${S3_FLAGS}` },
          { status: 500 },
        ),
    ],
    [
      'a plain-text body',
      () => new Response(`Command failed: ${S3_FLAGS}`, { status: 400 }),
    ],
    ['an unconfirmed answer', () => Response.json({ detail: S3_FLAGS })],
  ])('fails with a bounded diagnostic, never the provider body, for %s', async (_, answer) => {
    state.manualBackup = answer;

    const result = await runBackup(CREATE_STAGING);

    expect(result.exitCode).toBe(1);
    expect(result.output).not.toContain(S3_SECRET);
    expect(result.output).not.toContain('Command failed');
    expect(result.output).toContain('backup.manualBackupPostgres');
    expect(result.output).toContain('recovery-id');
    expect(result.output.length).toBeLessThan(600);
  });

  it('never prints a secret-bearing Dokploy version answer', async () => {
    state.version = `${S3_FLAGS}`;

    const result = await runBackup(CREATE_STAGING);

    expect(result.exitCode).toBe(1);
    expect(result.output).not.toContain(S3_SECRET);
    expect(triggeredBackups()).toEqual([]);
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
    [
      'Dokploy’s count-based pruning (counts failed uploads)',
      { keepLatestCount: 5 },
    ],
    ['another pruning count', { keepLatestCount: 10 }],
    ['an enabled schedule', { enabled: true }],
    ['a non-Postgres backup', { databaseType: 'mysql' }],
  ])('refuses a backup configuration with %s and starts nothing', async (_, overrides) => {
    state.backups['recovery-id'] = recoveryBackup(overrides);

    expect((await runBackup(CREATE_STAGING)).exitCode).toBe(1);
    expect(triggeredBackups()).toEqual([]);
  });

  it('creates a backup in a pool that does not yet hold five', async () => {
    state.poolFiles = {};

    const result = await runBackup(CREATE_STAGING);

    expect(result.exitCode).toBe(0);
    expect(triggeredBackups()).toHaveLength(1);
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
    ['pruned by Dokploy', { keepLatestCount: 5 }],
  ])('refuses a production scheduled backup that is %s', async (_, overrides) => {
    state.backups['scheduled-id'] = scheduledBackup(overrides);

    const result = await runBackup(CHECK_PRODUCTION, {
      CHURCH_SCHEDULED_BACKUP_ID: 'scheduled-id',
    });

    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['pre-deployment', 'church-postgres/production/pre-deployment/'],
    ['scheduled', 'church-postgres/production/scheduled/'],
  ])('refuses a %s pool holding fewer than five backups', async (pool, folder) => {
    state.poolFiles[folder] = 4;

    const result = await runBackup(CHECK_PRODUCTION, {
      CHURCH_SCHEDULED_BACKUP_ID: 'scheduled-id',
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(`${pool} pool holds 4 backup(s)`);
    expect(triggeredBackups()).toEqual([]);
  });

  it('refuses a backup whose PostgreSQL service it cannot identify', async () => {
    state.backups['scheduled-id'] = scheduledBackup({ postgres: null });

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
