import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Instant } from '../../../packages/time/src';
import {
  type FailureRecord,
  recordFailureBundle,
} from '../../diagnostics/failure-bundle';
import { testArtifacts } from '../../diagnostics/test-artifacts';

/**
 * Records bundles for a throwaway repository's feature worktree whose
 * `.env.local` holds a known secret and a known shared token, asserting only
 * what lands in the bundle directory.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const LOCAL_ENV_SCRIPT = resolve(REPO_ROOT, 'tooling/worktree/local-env.ts');
const SHARED_TOKEN = 'shared-unleash-token-4f1c9e';

let sandbox: string;
let primary: string;
let feature: string;
let bundlesDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: primary, encoding: 'utf8' }).trim();
}

function failure(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    command: 'db:bootstrap',
    step: 'databases',
    commandLine: ['bun', 'tooling/worktree/bootstrap-databases.ts'],
    purpose: null,
    startedAt: '2026-09-29T12:00:00.000Z' as Instant,
    finishedAt: '2026-09-29T12:00:02.500Z' as Instant,
    exitStatus: 1,
    signal: null,
    output: 'Error: boom\n',
    ...overrides,
  };
}

interface BundleFiles {
  path: string;
  metadata: Record<string, unknown>;
  output: string;
  files: string[];
}

function record(
  failureRecord: FailureRecord,
  artifactsDir: string | null = null,
): BundleFiles {
  const path = recordFailureBundle({
    cwd: feature,
    bundlesDir,
    record: failureRecord,
    artifacts:
      artifactsDir === null ? null : testArtifacts({ dir: artifactsDir }),
  });
  if (path === undefined) throw new Error('no bundle recorded');

  return {
    path,
    metadata: JSON.parse(readFileSync(join(path, 'bundle.json'), 'utf8')),
    output: readFileSync(join(path, 'output.log'), 'utf8'),
    files: readdirSync(path).sort(),
  };
}

function localEnvValue(key: string): string {
  const line = readFileSync(join(feature, '.env.local'), 'utf8')
    .split('\n')
    .find((candidate) => candidate.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from .env.local`);
  return line.slice(key.length + 1);
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-bundle-'));
  primary = join(sandbox, 'repo');
  feature = join(sandbox, 'repo.feature-a');
  bundlesDir = join(sandbox, 'bundles');
  execFileSync('git', ['init', '-q', '-b', 'develop', primary]);
  // CI runners have no Git identity.
  git([
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);
  git(['worktree', 'add', '-q', '-b', 'feature-a', feature]);
  writeFileSync(
    join(primary, '.git', 'church-shared.env'),
    `UNLEASH_API_TOKEN=${SHARED_TOKEN}\n`,
  );
  execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: feature, stdio: 'ignore' });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('recordFailureBundle', () => {
  it('records the command, step, timing, exit status, worktree, commit, purpose, ports, and redacted targets', () => {
    const bundle = record(
      failure({ purpose: 'integration', exitStatus: 3, signal: null }),
    );

    expect(bundle.path.startsWith(`${bundlesDir}/`)).toBe(true);
    expect(bundle.metadata).toEqual({
      command: 'db:bootstrap',
      step: 'databases',
      commandLine: 'bun tooling/worktree/bootstrap-databases.ts',
      startedAt: '2026-09-29T12:00:00.000Z',
      finishedAt: '2026-09-29T12:00:02.500Z',
      durationMs: 2500,
      exitStatus: 3,
      signal: null,
      worktree: 'feature_a',
      worktreePath: feature,
      commit: git(['rev-parse', 'HEAD']),
      purpose: 'integration',
      ports: {
        server: Number(localEnvValue('CHURCH_SERVER_PORT')),
        web: Number(localEnvValue('CHURCH_WEB_PORT')),
        e2eServer: Number(localEnvValue('PW_SERVER_PORT')),
        e2eWeb: Number(localEnvValue('PW_WEB_PORT')),
      },
      databaseTargets: [
        {
          purpose: 'development',
          host: '127.0.0.1',
          port: 5444,
          database: 'church_feature_a_dev',
        },
        {
          purpose: 'integration',
          host: '127.0.0.1',
          port: 5444,
          database: 'church_feature_a_int',
        },
        {
          purpose: 'e2e',
          host: '127.0.0.1',
          port: 5444,
          database: 'church_feature_a_e2e',
        },
      ],
      output: { file: 'output.log', totalLines: 1, omittedLines: 0 },
      artifacts: [],
    });
    expect(bundle.output).toBe('Error: boom\n');
  });

  it('keeps useful evidence but no credentials, query strings, cookies, tokens, secrets, or emails', () => {
    const authSecret = localEnvValue('BETTER_AUTH_SECRET');
    const secrets = [
      authSecret,
      SHARED_TOKEN,
      's3cr3t-db-pass',
      'sslmode=require',
      'invite-token-889',
      'session=abc123',
      'eyJhbGciOiJIUzI1NiJ9.payload.sig',
      'hunter2-password',
      'owner@church.example',
    ];
    const output = [
      '▸ worktree:bootstrap databases: bun run db:bootstrap',
      'connecting to postgresql://postgres:s3cr3t-db-pass@127.0.0.1:5444/church_feature_a_int?sslmode=require',
      'GET http://localhost:3000/api/invitations/accept?token=invite-token-889#frag',
      'Cookie: session=abc123; theme=dark',
      'set-cookie: session=abc123; Path=/',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      `BETTER_AUTH_SECRET=${authSecret}`,
      `leaked value ${SHARED_TOKEN} inline`,
      'DB_PASSWORD="hunter2-password"',
      'invited owner@church.example',
      'Error: relation "person" does not exist',
      '    at migrate (packages/db/src/provision-databases.ts:42:7)',
    ].join('\n');

    const bundle = record(
      failure({
        output,
        commandLine: [
          'bun',
          'probe.ts',
          'postgresql://postgres:s3cr3t-db-pass@127.0.0.1:5444/x?sslmode=require',
        ],
      }),
    );
    const written = `${JSON.stringify(bundle.metadata)}\n${bundle.output}`;

    for (const secret of secrets) {
      expect(written).not.toContain(secret);
    }
    expect(bundle.output).toContain(
      'postgresql://127.0.0.1:5444/church_feature_a_int',
    );
    expect(bundle.output).toContain(
      'http://localhost:3000/api/invitations/accept',
    );
    expect(bundle.output).toContain('Error: relation "person" does not exist');
    expect(bundle.output).toContain('provision-databases.ts:42:7');
    expect(bundle.metadata.commandLine).toBe(
      'bun probe.ts postgresql://127.0.0.1:5444/x',
    );
  });

  it('holds only its own metadata and output, never value files or the environment', () => {
    const bundle = record(failure());

    expect(bundle.files).toEqual(['bundle.json', 'output.log']);
    expect(JSON.stringify(bundle.metadata)).not.toContain('BETTER_AUTH_URL');
    expect(JSON.stringify(bundle.metadata)).not.toContain(
      process.env.PATH ?? 'PATH',
    );
  });

  it('keeps the first 100 and last 300 lines, each capped at 1,000 characters', () => {
    const output = Array.from(
      { length: 1000 },
      (_, index) => `line ${index + 1}`,
    );
    output[0] = `line 1 ${'x'.repeat(5000)}`;

    const bundle = record(failure({ output: `${output.join('\n')}\n` }));
    const lines = bundle.output.trimEnd().split('\n');

    expect(lines).toHaveLength(401);
    expect(lines[0]).toHaveLength(1000);
    expect(lines[99]).toBe('line 100');
    expect(lines[100]).toBe('… 600 lines omitted …');
    expect(lines[101]).toBe('line 701');
    expect(lines.at(-1)).toBe('line 1000');
    expect(bundle.metadata.output).toEqual({
      file: 'output.log',
      totalLines: 1000,
      omittedLines: 600,
    });
  });

  it('names each bundle by time, command, and worktree without overwriting another', () => {
    const first = record(failure());
    const second = record(failure());

    expect(first.path).not.toBe(second.path);
    expect(basename(first.path)).toStartWith(
      '20260929T120002Z-db-bootstrap-feature_a-',
    );
  });

  it('removes bundles older than 14 days when it records a new one', () => {
    const DAY = 24 * 60 * 60;
    const recordedAt = Date.parse('2026-09-29T12:00:02.500Z') / 1000;
    const aged = (name: string, days: number): string => {
      const path = join(bundlesDir, name);
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'output.log'), 'old\n');
      utimesSync(path, recordedAt - days * DAY, recordedAt - days * DAY);
      return name;
    };
    const expired = aged('20260914T000000Z-env-local-old-1', 15);
    const recent = aged('20260916T000000Z-env-local-old-2', 13);

    const bundle = record(failure());

    expect(readdirSync(bundlesDir).sort()).toEqual(
      [recent, basename(bundle.path)].sort(),
    );
    expect(readdirSync(bundlesDir)).not.toContain(expired);
  });

  it('strips connection credentials even when a value-file password is a common word', () => {
    writeFileSync(join(feature, '.env'), 'POSTGRES_PASSWORD=postgres\n');

    const bundle = record(
      failure({
        output: [
          'postgres://user:secret-9a@[::1]:5432/db?sslmode=require',
          'postgresql://postgres:postgres@127.0.0.1:5444/church_feature_a_dev',
          'https://user:p@ss-7c@example.com/a',
          'https://user:pa/ss-7d@example.com/b',
        ].join('\n'),
        commandLine: ['psql', 'postgres://u:pw-3e@h:1/d?x=1'],
      }),
    );
    const written = `${JSON.stringify(bundle.metadata)}\n${bundle.output}`;

    for (const secret of [
      'secret-9a',
      'sslmode',
      'p@ss-7c',
      'ss-7d',
      'pw-3e',
    ]) {
      expect(written).not.toContain(secret);
    }
    expect(bundle.output).toContain('postgres://[::1]:5432/db');
    expect(bundle.output).toContain(
      'postgresql://127.0.0.1:5444/church_feature_a_dev',
    );
    expect(bundle.output).toContain('https://example.com/a');
    expect(bundle.metadata.commandLine).toBe('psql postgres://h:1/d');
  });

  it('redacts JSON keys, command-line flags, API-key headers, JWTs, and private keys', () => {
    const secrets = [
      'json-pass-1',
      'json-tok-2',
      'json-cookie-3',
      'flag-pass-4',
      'flag-tok-5',
      'header-key-6',
      'eyJzdWIiOiIxIn0',
      'MIIpemBody7',
      'flag-pass-8',
    ];

    const bundle = record(
      failure({
        output: [
          '{"password":"json-pass-1","token": "json-tok-2","cookie":"json-cookie-3"}',
          'run --password flag-pass-4 --token=flag-tok-5 --verbose',
          'x-api-key: header-key-6',
          'id eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
          '-----BEGIN PRIVATE KEY-----',
          'MIIpemBody7',
          '-----END PRIVATE KEY-----',
          'after the key',
        ].join('\n'),
        commandLine: ['tool', '--password', 'flag-pass-8'],
      }),
    );
    const written = `${JSON.stringify(bundle.metadata)}\n${bundle.output}`;

    for (const secret of secrets) {
      expect(written).not.toContain(secret);
    }
    expect(bundle.output).toContain('--verbose');
    expect(bundle.output).toContain('after the key');
  });

  it('prunes only expired bundles, never other entries in the directory', () => {
    const DAY = 24 * 60 * 60;
    const old = Date.parse('2026-09-01T00:00:00.000Z') / 1000;
    mkdirSync(join(bundlesDir, 'notes'), { recursive: true });
    writeFileSync(join(bundlesDir, 'keep.txt'), 'unrelated\n');
    utimesSync(join(bundlesDir, 'notes'), old - DAY, old - DAY);
    utimesSync(join(bundlesDir, 'keep.txt'), old - DAY, old - DAY);

    const bundle = record(failure());

    expect(readdirSync(bundlesDir).sort()).toEqual(
      [basename(bundle.path), 'keep.txt', 'notes'].sort(),
    );
  });

  it('still records when an entry disappears while it prunes', () => {
    mkdirSync(bundlesDir, { recursive: true });
    symlinkSync(
      join(sandbox, 'gone'),
      join(bundlesDir, '20260901T000000Z-env-local-gone-abc123'),
    );

    const bundle = record(failure());

    expect(bundle.files).toEqual(['bundle.json', 'output.log']);
  });

  it('includes test reports and traces, sanitized, and leaves binary evidence intact', () => {
    const authSecret = localEnvValue('BETTER_AUTH_SECRET');
    const invitationId = '8b0e7f0c-5d3a-4c61-9b7e-2f1a6c9d4e13';
    const screenshot = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
    const artifactsDir = join(sandbox, 'test-results');
    const specDir = join(artifactsDir, 'redemption-new-user-chromium');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(
      join(specDir, 'error-context.md'),
      `# Error\nInvitation: ${invitationId} for owner@church.example\nsecret ${authSecret}\nexpect(locator).toBeVisible() failed\n`,
    );
    writeFileSync(join(specDir, 'test-failed-1.png'), screenshot);
    writeFileSync(
      join(specDir, 'trace.zip'),
      zipSync({
        'trace.network': strToU8(
          `${JSON.stringify({
            snapshot: {
              request: {
                url: 'http://localhost:4100/api/auth/get-session',
                cookies: [{ name: 'session', value: 'trace-cookie-5521' }],
              },
            },
          })}\n`,
        ),
      }),
    );
    writeFileSync(join(artifactsDir, '.last-run.json'), '{"status":"failed"}');

    const bundle = record(failure({ command: 'test:e2e' }), artifactsDir);

    expect(bundle.metadata.artifacts).toEqual([
      'artifacts/.last-run.json',
      'artifacts/redemption-new-user-chromium/error-context.md',
      'artifacts/redemption-new-user-chromium/test-failed-1.png',
      'artifacts/redemption-new-user-chromium/trace.zip',
    ]);
    const artifact = (name: string) =>
      readFileSync(join(bundle.path, 'artifacts', name));

    const report = artifact(
      'redemption-new-user-chromium/error-context.md',
    ).toString();
    expect(report).toContain('toBeVisible() failed');
    for (const secret of [invitationId, 'owner@church.example', authSecret]) {
      expect(report).not.toContain(secret);
    }
    expect(
      new Uint8Array(
        artifact('redemption-new-user-chromium/test-failed-1.png'),
      ),
    ).toEqual(screenshot);
    const trace = strFromU8(
      unzipSync(
        new Uint8Array(artifact('redemption-new-user-chromium/trace.zip')),
      )['trace.network'] ?? new Uint8Array(),
    );
    expect(trace).toContain('http://localhost:4100/api/auth/get-session');
    expect(trace).not.toContain('trace-cookie-5521');
  });

  it('records without artifacts when the artifact directory is absent', () => {
    const bundle = record(failure(), join(sandbox, 'never-created'));

    expect(bundle.files).toEqual(['bundle.json', 'output.log']);
    expect(bundle.metadata.artifacts).toEqual([]);
  });
});
