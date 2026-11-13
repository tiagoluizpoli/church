import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';

/**
 * Runs the real deployment command against one stand-in server that plays
 * GitHub, Dokploy (including its backups) and the deployed application, so
 * every external answer is controlled and every downstream call is recorded.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const REVISION = 'a'.repeat(40);
const OLD_REVISION = 'b'.repeat(40);
const SERVER_IMAGE = `ghcr.io/church/church-server@sha256:${'1'.repeat(64)}`;
const WEB_IMAGE = `ghcr.io/church/church-web@sha256:${'2'.repeat(64)}`;
const SECRET = 'super-secret-database-password';
const COMPOSE_ID = 'compose-dev';
const CANDIDATE = 'v1.2.0-rc.1';
const CONTENT = 'c'.repeat(64);
const EVIDENCE = 'staging-evidence.json';
const RELEASE = 'v1.2.0';
// rc.10 outranks rc.9 numerically, not as text.
const PROMOTED = 'v1.2.0-rc.10';
const EVIDENCE_ASSET_ID = 11;
const RECORD_ID = 77;
const RECORDS = '/repos/church/app/deployments';

interface ListedRelease {
  // biome-ignore lint/style/useNamingConvention: GitHub's response field
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ id: number; name: string }>;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

interface Deployment {
  deploymentId: string;
  description: string | null;
  status: string;
  errorMessage: string | null;
}

interface State {
  environment: string;
  evidenceAssets: Array<{ id: number; name: string }>;
  upload: () => Response;
  branchHead: string;
  checkRuns: () => CheckRun[];
  compose: { sourceType: string; env: string };
  manualBackup: () => Response;
  deployments: Deployment[];
  // Status reported for the deployment `compose.deploy` creates, per poll.
  deploymentStatus: () => { status: string; errorMessage: string | null };
  revisionTxt: () => Response;
  health: () => Response;
  releases: ListedRelease[];
  stagingEvidence: () => Response;
  promotedCommit: string;
  // GitHub's answer to the rollback's lookup of verified rollouts.
  verifiedRollouts: () => Response;
}

interface RecordedRequest {
  path: string;
  body: string;
  authorized: boolean;
}

let state: State;
let requests: RecordedRequest[];
let server: ReturnType<typeof Bun.serve>;
let workDir: string;
// The checkout the command reads revisions from.
let gitDir: string;

function backupConfiguration() {
  return {
    backupId: 'recovery-id',
    database: `church_${state.environment}`,
    prefix: `${state.environment}/pre-deployment`,
    schedule: '0 0 * * *',
    enabled: false,
    keepLatestCount: 5,
    databaseType: 'postgres',
    backupType: 'database',
  };
}

function handle(url: URL, body: string): Response {
  const { pathname } = url;
  if (pathname === '/repos/church/app/branches/develop') {
    return Response.json({ commit: { sha: state.branchHead } });
  }
  if (pathname === `/repos/church/app/commits/${REVISION}/check-runs`) {
    // biome-ignore lint/style/useNamingConvention: GitHub's response field
    return Response.json({ check_runs: state.checkRuns() });
  }
  if (pathname === `/repos/church/app/releases/tags/${CANDIDATE}`) {
    return Response.json({
      // biome-ignore lint/style/useNamingConvention: GitHub's response field
      upload_url: `${server.url.origin}/uploads/releases/7/assets{?name,label}`,
      assets: [{ id: 3, name: 'notes.txt' }, ...state.evidenceAssets],
    });
  }
  if (pathname === '/repos/church/app/releases') {
    return Response.json(
      url.searchParams.get('page') === '1' ? state.releases : [],
    );
  }
  if (pathname === `/repos/church/app/commits/${PROMOTED}`) {
    return Response.json({ sha: state.promotedCommit });
  }
  if (pathname === `/repos/church/app/releases/assets/${EVIDENCE_ASSET_ID}`) {
    // GitHub redirects an asset download to signed storage.
    return Response.redirect(`${server.url.origin}/storage/evidence`, 302);
  }
  if (pathname === '/storage/evidence') return state.stagingEvidence();
  if (pathname.startsWith('/repos/church/app/releases/assets/')) {
    return new Response(null, { status: 204 });
  }
  if (pathname === '/uploads/releases/7/assets') return state.upload();
  if (pathname === '/repos/church/app/deployments') {
    return body
      ? Response.json({ id: RECORD_ID }, { status: 201 })
      : state.verifiedRollouts();
  }
  if (pathname === `/repos/church/app/deployments/${RECORD_ID}/statuses`) {
    return Response.json({ id: 1 }, { status: 201 });
  }
  if (pathname === '/api/settings.getDokployVersion') {
    return Response.json('v0.31.2');
  }
  if (pathname === '/api/backup.one')
    return Response.json(backupConfiguration());
  if (pathname === '/api/backup.manualBackupPostgres')
    return state.manualBackup();
  if (pathname === '/api/compose.one') return Response.json(state.compose);
  if (pathname === '/api/compose.update') return Response.json(true);
  if (pathname === '/api/compose.deploy') {
    const { description } = JSON.parse(body) as { description: string };
    state.deployments.unshift({
      deploymentId: 'new-deployment',
      description,
      status: 'running',
      errorMessage: null,
    });
    return Response.json({ success: true, message: 'Deployment queued' });
  }
  if (pathname === '/api/deployment.allByCompose') {
    return Response.json(
      state.deployments.map((deployment) =>
        deployment.deploymentId === 'new-deployment'
          ? { ...deployment, ...state.deploymentStatus() }
          : deployment,
      ),
    );
  }
  if (pathname === '/revision.txt') return state.revisionTxt();
  if (pathname === '/api/health') return state.health();
  return new Response('not found', { status: 404 });
}

beforeEach(() => {
  requests = [];
  workDir = mkdtempSync(join(tmpdir(), 'deploy-command-'));
  writeFileSync(join(workDir, 'compose.yml'), 'services: {}\n');
  state = {
    environment: 'development',
    evidenceAssets: [],
    upload: () => Response.json({ id: 9 }, { status: 201 }),
    branchHead: REVISION,
    checkRuns: () => [
      { id: 1, name: 'Fast Gate', status: 'completed', conclusion: 'success' },
    ],
    compose: {
      sourceType: 'raw',
      env: `CHURCH_ENVIRONMENT=development\nDATABASE_URL=postgresql://church_development:${SECRET}@db/church_development\nSERVER_IMAGE=old-server\n`,
    },
    manualBackup: () => Response.json(true),
    deployments: [
      {
        deploymentId: 'previous-deployment',
        description: `revision ${OLD_REVISION}`,
        status: 'done',
        errorMessage: null,
      },
    ],
    deploymentStatus: () => ({ status: 'done', errorMessage: null }),
    revisionTxt: () => new Response(`${REVISION}\n`),
    health: () =>
      Response.json({ status: 'ok', database: 'ok', revision: REVISION }),
    releases: [],
    stagingEvidence: () => Response.json(stagingEvidence()),
    promotedCommit: REVISION,
    verifiedRollouts: () => Response.json([]),
  };
  gitDir = REPO_ROOT;
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body = await request.text();
      requests.push({
        path: `${request.method === 'DELETE' ? 'DELETE ' : ''}${url.pathname}${url.search}`,
        body,
        authorized: request.headers.has('authorization'),
      });
      return handle(url, body);
    },
  });
});

afterEach(() => {
  server.stop(true);
  rmSync(workDir, { recursive: true, force: true });
});

// Async spawn: a synchronous one would block the stand-in server in this process.
async function runDeploy(
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  const outputPath = join(workDir, 'github-output');
  const summaryPath = join(workDir, 'step-summary');
  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');
  const origin = server.url.origin;
  const child = Bun.spawn(
    [
      'bun',
      '--no-env-file',
      join(REPO_ROOT, 'tooling/deployment/deploy.ts'),
      ...args,
    ],
    {
      cwd: gitDir,
      env: {
        PATH: process.env.PATH,
        GITHUB_API_URL: origin,
        GITHUB_REPOSITORY: 'church/app',
        GITHUB_TOKEN: 'github-token',
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        DOKPLOY_URL: origin,
        DOKPLOY_API_KEY: 'dokploy-key',
        DOKPLOY_COMPOSE_ID: COMPOSE_ID,
        CHURCH_BACKUP_ID: 'recovery-id',
        PUBLIC_ORIGIN: origin,
        CHURCH_DEPLOY_POLL_INTERVAL_MS: '1',
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
  return {
    exitCode,
    output: `${stdout}${stderr}`,
    githubOutput: readFileSync(outputPath, 'utf8'),
    summary: readFileSync(summaryPath, 'utf8'),
  };
}

const CHECKS = [
  'checks',
  `--revision=${REVISION}`,
  '--branch=develop',
  '--check=Fast Gate',
];

function rolloutArgs(overrides: Record<string, string> = {}): string[] {
  const values = {
    environment: 'development',
    revision: REVISION,
    'server-image': SERVER_IMAGE,
    'web-image': WEB_IMAGE,
    'compose-file': join(workDir, 'compose.yml'),
    ...overrides,
  };
  return [
    'rollout',
    ...Object.entries(values).map(([key, value]) => `--${key}=${value}`),
  ];
}

const DOWNSTREAM = new Set([
  '/api/backup.manualBackupPostgres',
  '/api/compose.update',
  '/api/compose.deploy',
]);

function downstreamCalls(): string[] {
  return requests.map((r) => r.path).filter((path) => DOWNSTREAM.has(path));
}

const EVIDENCE_CALLS =
  /^DELETE |^\/uploads\/|^\/api\/backup\.manualBackupPostgres$/;

function evidenceCalls(): string[] {
  return requests
    .map((r) => r.path)
    .filter((path) => EVIDENCE_CALLS.test(path));
}

function stagingArgs(overrides: Record<string, string> = {}): string[] {
  return rolloutArgs({
    environment: 'staging',
    candidate: CANDIDATE,
    content: CONTENT,
    ...overrides,
  });
}

function stagingEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    environment: 'staging',
    candidate: { tag: PROMOTED, version: PROMOTED.slice(1) },
    revision: REVISION,
    content: CONTENT,
    images: { server: SERVER_IMAGE, web: WEB_IMAGE },
    rollout: { status: 'verified', url: 'https://staging.example' },
    ...overrides,
  };
}

function listed(tag: string, overrides: Partial<ListedRelease> = {}) {
  return {
    // biome-ignore lint/style/useNamingConvention: GitHub's response field
    tag_name: tag,
    draft: false,
    prerelease: true,
    assets: [],
    ...overrides,
  };
}

function promoteArgs(overrides: Record<string, string> = {}): string[] {
  const values = {
    release: RELEASE,
    content: CONTENT,
    'compose-file': join(workDir, 'compose.yml'),
    ...overrides,
  };
  return [
    'promote',
    ...Object.entries(values).map(([key, value]) => `--${key}=${value}`),
  ];
}

function useProduction(): void {
  state.environment = 'production';
  state.compose.env =
    'CHURCH_ENVIRONMENT=production\nSERVER_IMAGE=old-server\n';
  state.releases = [
    listed(RELEASE, { prerelease: false }),
    // A newer draft and another version's candidate are not this release's.
    listed('v1.2.0-rc.11', { draft: true }),
    listed('v1.3.0-rc.1', { assets: [{ id: 99, name: EVIDENCE }] }),
    listed(PROMOTED, {
      assets: [
        { id: 3, name: 'notes.txt' },
        { id: EVIDENCE_ASSET_ID, name: EVIDENCE },
      ],
    }),
    listed('v1.2.0-rc.9', { assets: [{ id: 98, name: EVIDENCE }] }),
  ];
}

function dokployCalls(): string[] {
  return requests.map((r) => r.path).filter((path) => path.startsWith('/api/'));
}

function useStaging(): void {
  state.environment = 'staging';
  state.compose.env = 'CHURCH_ENVIRONMENT=staging\n';
  // A previous run of this candidate left evidence behind.
  state.evidenceAssets = [{ id: 5, name: EVIDENCE }];
}

describe('deploy checks', () => {
  it('selects the revision once its required checks pass', async () => {
    let polls = 0;
    state.checkRuns = () =>
      polls++ === 0
        ? [
            {
              id: 1,
              name: 'Fast Gate',
              status: 'in_progress',
              conclusion: null,
            },
          ]
        : [
            {
              id: 1,
              name: 'Fast Gate',
              status: 'completed',
              conclusion: 'success',
            },
          ];

    const result = await runDeploy(CHECKS);

    expect(result.exitCode).toBe(0);
    expect(result.githubOutput).toBe('deploy=true\n');
  });

  it('refuses a revision whose required check failed', async () => {
    state.checkRuns = () => [
      { id: 1, name: 'Fast Gate', status: 'completed', conclusion: 'failure' },
    ];

    const result = await runDeploy(CHECKS);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('"Fast Gate" concluded failure');
    expect(result.githubOutput).toBe('');
  });

  it('judges a re-run by its newest check run', async () => {
    state.checkRuns = () => [
      { id: 1, name: 'Fast Gate', status: 'completed', conclusion: 'failure' },
      { id: 2, name: 'Fast Gate', status: 'completed', conclusion: 'success' },
    ];

    const result = await runDeploy(CHECKS);

    expect(result.githubOutput).toBe('deploy=true\n');
  });

  it('skips an obsolete revision once the branch has moved on', async () => {
    state.branchHead = OLD_REVISION;

    const result = await runDeploy(CHECKS);

    expect(result.exitCode).toBe(0);
    expect(result.githubOutput).toBe('deploy=false\n');
  });

  it('fails when a required check never reports', async () => {
    state.checkRuns = () => [];

    const result = await runDeploy(CHECKS);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('did not complete');
  });
});

describe('deploy rollout', () => {
  it('backs up, selects the images and succeeds only once the revision is served', async () => {
    let healthPolls = 0;
    // The old container is still healthy at first: not enough.
    state.health = () =>
      Response.json({
        status: 'ok',
        database: 'ok',
        revision: healthPolls++ < 2 ? OLD_REVISION : REVISION,
      });

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(0);
    expect(downstreamCalls()).toEqual([
      '/api/backup.manualBackupPostgres',
      '/api/compose.update',
      '/api/compose.deploy',
    ]);
    const update = requests.find((r) => r.path === '/api/compose.update');
    const { env, composeFile } = JSON.parse(update?.body ?? '{}');
    expect(composeFile).toBe('services: {}\n');
    expect(env).toContain(`SERVER_IMAGE=${SERVER_IMAGE}\n`);
    expect(env).toContain(`WEB_IMAGE=${WEB_IMAGE}\n`);
    expect(env).not.toContain('old-server');
    expect(env).toContain(SECRET);
    expect(healthPolls).toBe(3);
    for (const text of [result.output, result.summary]) {
      expect(text).toContain(REVISION);
      expect(text).toContain(SERVER_IMAGE);
      expect(text).toContain(WEB_IMAGE);
      expect(text).toContain(server.url.origin);
      expect(text).not.toContain(SECRET);
    }
    expect(result.githubOutput).toBe(`url=${server.url.origin}\n`);
    // The verified image set becomes a durable rollback target.
    const record = requests.find((r) => r.path === RECORDS && r.body);
    expect(JSON.parse(record?.body ?? '{}')).toMatchObject({
      ref: REVISION,
      environment: 'verified-development',
      payload: {
        schema: 1,
        environment: 'development',
        revision: REVISION,
        images: { server: SERVER_IMAGE, web: WEB_IMAGE },
      },
    });
  });

  it('refuses while an earlier Dokploy deployment is still running', async () => {
    state.deployments[0] = {
      deploymentId: 'timed-out-deployment',
      description: `revision ${OLD_REVISION}`,
      status: 'running',
      errorMessage: null,
    };

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('timed-out-deployment');
    expect(result.output).toContain('still running');
    expect(downstreamCalls()).toEqual([]);
  });

  it('records no rollback target when the revision is never served', async () => {
    state.health = () =>
      Response.json({ status: 'ok', database: 'ok', revision: OLD_REVISION });

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(requests.map((r) => r.path)).not.toContain(RECORDS);
  });

  it('never seeds or provisions anything', async () => {
    await runDeploy(rolloutArgs());

    const bodies = requests.map((r) => `${r.path} ${r.body}`).join('\n');
    expect(bodies).not.toMatch(/seed|provision/i);
  });

  it('stops before deploying when the required backup fails', async () => {
    state.manualBackup = () =>
      Response.json({ message: 'S3 unreachable' }, { status: 500 });

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('S3 unreachable');
    expect(result.output).toContain('nothing was deployed');
    expect(downstreamCalls()).toEqual(['/api/backup.manualBackupPostgres']);
  });

  it('refuses a Dokploy compose configured for another environment', async () => {
    state.compose.env = 'CHURCH_ENVIRONMENT=staging\n';

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('CHURCH_ENVIRONMENT=staging');
    expect(downstreamCalls()).toEqual([]);
  });

  it('refuses a compose that would not deploy the revision’s compose file', async () => {
    state.compose.sourceType = 'github';

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('must be "raw"');
    expect(downstreamCalls()).toEqual([]);
  });

  it('refuses mutable image tags', async () => {
    const result = await runDeploy(
      rolloutArgs({ 'server-image': 'ghcr.io/church/church-server:latest' }),
    );

    expect(result.exitCode).toBe(2);
    expect(requests).toEqual([]);
  });

  it('names a missing live input and touches nothing', async () => {
    const result = await runDeploy(rolloutArgs(), {
      DOKPLOY_COMPOSE_ID: undefined,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('DOKPLOY_COMPOSE_ID is not set');
    expect(requests).toEqual([]);
  });

  it('reports a failed migration from Dokploy and never checks health', async () => {
    state.deploymentStatus = () => ({
      status: 'error',
      errorMessage: 'service "migrate" didn\'t complete successfully: exit 1',
    });

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('new-deployment ended error');
    expect(result.output).toContain('"migrate"');
    expect(requests.map((r) => r.path)).not.toContain('/api/health');
    expect(result.summary).toBe('');
  });

  it('does not treat Dokploy accepting the deployment as success', async () => {
    state.deploymentStatus = () => ({ status: 'running', errorMessage: null });

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('did not report it finished');
    expect(requests.map((r) => r.path)).not.toContain('/api/health');
  });

  it('fails while the old container keeps serving its revision', async () => {
    state.revisionTxt = () => new Response(`${OLD_REVISION}\n`);
    state.health = () =>
      Response.json({ status: 'ok', database: 'ok', revision: OLD_REVISION });

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(`frontend serves revision ${OLD_REVISION}`);
    expect(result.output).toContain(`API serves revision ${OLD_REVISION}`);
    expect(result.summary).toBe('');
  });

  it('fails while the API cannot reach its database', async () => {
    state.health = () =>
      Response.json(
        { status: 'unavailable', database: 'unavailable', revision: REVISION },
        { status: 503 },
      );

    const result = await runDeploy(rolloutArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('HTTP 503 with database unavailable');
  });
});

describe('deploy rollout of a staging candidate', () => {
  beforeEach(useStaging);

  it('withdraws old evidence first and publishes verified evidence last', async () => {
    const result = await runDeploy(stagingArgs(), {
      GITHUB_SERVER_URL: 'https://github.example',
      GITHUB_RUN_ID: '42',
    });

    expect(result.exitCode).toBe(0);
    expect(evidenceCalls()).toEqual([
      'DELETE /repos/church/app/releases/assets/5',
      '/api/backup.manualBackupPostgres',
      `/uploads/releases/7/assets?name=${EVIDENCE}`,
    ]);
    const upload = requests.find((r) => r.path.startsWith('/uploads/'));
    expect(JSON.parse(upload?.body ?? '{}')).toEqual({
      schema: 1,
      environment: 'staging',
      candidate: { tag: CANDIDATE, version: '1.2.0-rc.1' },
      revision: REVISION,
      content: CONTENT,
      images: { server: SERVER_IMAGE, web: WEB_IMAGE },
      rollout: {
        status: 'verified',
        url: server.url.origin,
        dokployDeploymentId: 'new-deployment',
        run: 'https://github.example/church/app/actions/runs/42',
      },
    });
    expect(upload?.body).not.toContain(SECRET);
    expect(result.summary).toContain(CANDIDATE);
    expect(result.summary).toContain(CONTENT);
  });

  it.each([
    [
      'the required backup fails',
      () => {
        state.manualBackup = () =>
          Response.json({ message: 'S3 unreachable' }, { status: 500 });
      },
    ],
    [
      'the migration fails',
      () => {
        state.deploymentStatus = () => ({
          status: 'error',
          errorMessage: 'service "migrate" exited 1',
        });
      },
    ],
    [
      'the candidate never serves its revision',
      () => {
        state.health = () =>
          Response.json({
            status: 'ok',
            database: 'ok',
            revision: OLD_REVISION,
          });
      },
    ],
  ])('leaves no evidence when %s', async (_, fail) => {
    fail();

    const result = await runDeploy(stagingArgs());

    expect(result.exitCode).toBe(1);
    expect(requests.map((r) => r.path)).toContain(
      'DELETE /repos/church/app/releases/assets/5',
    );
    expect(requests.some((r) => r.path.startsWith('/uploads/'))).toBe(false);
  });

  it('fails when verified evidence cannot be published', async () => {
    state.upload = () =>
      Response.json({ message: 'forbidden' }, { status: 403 });

    const result = await runDeploy(stagingArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('evidence was not published');
  });

  it('refuses a staging rollout of anything but a release candidate', async () => {
    const results = [
      await runDeploy(rolloutArgs({ environment: 'staging' })),
      await runDeploy(stagingArgs({ candidate: 'v1.2.0' })),
      await runDeploy(stagingArgs({ content: 'not-an-identity' })),
    ];

    expect(results.map((result) => result.exitCode)).toEqual([2, 2, 2]);
    expect(requests).toEqual([]);
  });

  it('refuses candidate evidence outside staging', async () => {
    const result = await runDeploy(
      rolloutArgs({ candidate: CANDIDATE, content: CONTENT }),
    );

    expect(result.exitCode).toBe(2);
    expect(requests).toEqual([]);
  });

  it('touches no evidence when the Dokploy target is another environment', async () => {
    state.compose.env = 'CHURCH_ENVIRONMENT=production\n';

    const result = await runDeploy(stagingArgs());

    expect(result.exitCode).toBe(1);
    expect(evidenceCalls()).toEqual([]);
  });
});

describe('deploy promote of a stable release', () => {
  beforeEach(useProduction);

  it('rolls out the newest verified candidate’s images without rebuilding', async () => {
    const result = await runDeploy(promoteArgs());

    expect(result.exitCode).toBe(0);
    expect(downstreamCalls()).toEqual([
      '/api/backup.manualBackupPostgres',
      '/api/compose.update',
      '/api/compose.deploy',
    ]);
    const update = requests.find((r) => r.path === '/api/compose.update');
    const { env } = JSON.parse(update?.body ?? '{}');
    expect(env).toContain(`SERVER_IMAGE=${SERVER_IMAGE}\n`);
    expect(env).toContain(`WEB_IMAGE=${WEB_IMAGE}\n`);
    expect(env).not.toContain('old-server');
    const download = requests.find((r) => r.path === '/storage/evidence');
    expect(download?.authorized).toBe(false);
    // Release metadata and the promoted application revision are both reported.
    for (const text of [result.output, result.summary]) {
      expect(text).toContain(RELEASE);
      expect(text).toContain(PROMOTED);
      expect(text).toContain(REVISION);
      expect(text).toContain(SERVER_IMAGE);
    }
  });

  it.each([
    [
      'no candidate of the version was published',
      () => {
        state.releases = [listed(RELEASE, { prerelease: false })];
      },
      'No published v1.2.0-rc.N candidate',
    ],
    [
      'the newest candidate has no staging evidence',
      () => {
        state.releases = [listed(PROMOTED), ...state.releases];
      },
      `${PROMOTED} has no ${EVIDENCE}`,
    ],
    [
      'the staging rollout was not verified',
      () => {
        state.stagingEvidence = () =>
          Response.json(stagingEvidence({ rollout: { status: 'failed' } }));
      },
      'was not verified on staging',
    ],
    [
      'the evidence belongs to another candidate',
      () => {
        state.stagingEvidence = () =>
          Response.json(stagingEvidence({ candidate: { tag: 'v1.2.0-rc.9' } }));
      },
      'does not describe a staging rollout',
    ],
    [
      'the evidence names a mutable image',
      () => {
        state.stagingEvidence = () =>
          Response.json(
            stagingEvidence({
              images: {
                server: 'ghcr.io/church/church-server:latest',
                web: WEB_IMAGE,
              },
            }),
          );
      },
      'immutable images',
    ],
    [
      'the evidence is not JSON',
      () => {
        state.stagingEvidence = () => new Response('<html>');
      },
      'is not JSON',
    ],
    [
      'the evidence cannot be downloaded',
      () => {
        state.stagingEvidence = () => new Response('gone', { status: 404 });
      },
      'could not be downloaded',
    ],
    [
      'the application content changed after the candidate',
      () => {
        state.stagingEvidence = () =>
          Response.json(stagingEvidence({ content: 'd'.repeat(64) }));
      },
      'the application changed',
    ],
    [
      'the candidate tag moved after staging verified it',
      () => {
        state.promotedCommit = OLD_REVISION;
      },
      `now points at ${OLD_REVISION}`,
    ],
  ])('refuses before any backup or deployment when %s', async (_, fail, message) => {
    fail();

    const result = await runDeploy(promoteArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(message);
    expect(result.output).toContain('Not promoting');
    expect(dokployCalls()).toEqual([]);
    expect(result.summary).toBe('');
  });

  it('refuses a Dokploy target outside production before the backup', async () => {
    state.compose.env = 'CHURCH_ENVIRONMENT=staging\n';

    const result = await runDeploy(promoteArgs());

    expect(result.exitCode).toBe(1);
    expect(downstreamCalls()).toEqual([]);
  });

  it.each([
    ['a release candidate', { release: 'v1.2.0-rc.1' }],
    ['a malformed release', { release: '1.2.0' }],
    ['a missing content identity', { content: 'not-an-identity' }],
  ])('refuses to promote %s', async (_, overrides) => {
    const result = await runDeploy(promoteArgs(overrides));

    expect(result.exitCode).toBe(2);
    expect(requests).toEqual([]);
  });

  it('keeps production out of reach of a direct rollout', async () => {
    const result = await runDeploy(rolloutArgs({ environment: 'production' }));

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('only by promoting');
    expect(requests).toEqual([]);
  });
});

describe('deploy rollback to a verified image set', () => {
  const MIGRATIONS = 'packages/db/src/migrations';
  const ROLLBACK_SERVER = `ghcr.io/church/church-server@sha256:${'3'.repeat(64)}`;
  const ROLLBACK_WEB = `ghcr.io/church/church-web@sha256:${'4'.repeat(64)}`;
  let checkout: string;
  // Each revision adds one migration; 0001 declares the application before
  // it still runs against its schema, 0002 does not.
  let base: string;
  let compatible: string;
  let incompatible: string;

  function git(args: string[]): string {
    const result = Bun.spawnSync(
      ['git', '-c', 'user.name=Rollback Test', '-c', 'user.email=t@t', ...args],
      { cwd: checkout },
    );
    if (result.exitCode !== 0) throw new Error(String(result.stderr));
    return String(result.stdout).trim();
  }

  function commitMigration(sql: string): string {
    const journal = JSON.parse(
      readFileSync(join(checkout, MIGRATIONS, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    const tag = `000${journal.entries.length}_change`;
    journal.entries.push({ tag });
    writeFileSync(join(checkout, MIGRATIONS, `${tag}.sql`), sql);
    writeFileSync(
      join(checkout, MIGRATIONS, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    git(['add', '.']);
    git(['commit', '-q', '-m', tag]);
    return git(['rev-parse', 'HEAD']);
  }

  beforeAll(() => {
    checkout = mkdtempSync(join(tmpdir(), 'deploy-rollback-'));
    git(['init', '-q']);
    mkdirSync(join(checkout, MIGRATIONS, 'meta'), { recursive: true });
    writeFileSync(
      join(checkout, MIGRATIONS, 'meta/_journal.json'),
      JSON.stringify({ entries: [] }),
    );
    base = commitMigration('CREATE TABLE "a" ("id" int);');
    compatible = commitMigration(
      '-- rollback-compatible: a nullable column the previous application ignores\nALTER TABLE "a" ADD COLUMN "b" text;',
    );
    incompatible = commitMigration('ALTER TABLE "a" DROP COLUMN "id";');
  });

  afterAll(() => rmSync(checkout, { recursive: true, force: true }));

  function verified(revision: string, overrides: Record<string, unknown> = {}) {
    return {
      payload: {
        schema: 1,
        environment: state.environment,
        revision,
        images: { server: ROLLBACK_SERVER, web: ROLLBACK_WEB },
        ...overrides,
      },
    };
  }

  function deployed(...revisions: string[]): Deployment[] {
    return revisions.map((revision, index) => ({
      deploymentId: `deployment-${index}`,
      description: `revision ${revision}`,
      status: index === 0 ? 'error' : 'done',
      errorMessage: null,
    }));
  }

  function serving(revision: string): void {
    state.revisionTxt = () => new Response(`${revision}\n`);
    state.health = () =>
      Response.json({ status: 'ok', database: 'ok', revision });
  }

  function rollbackArgs(overrides: Record<string, string> = {}): string[] {
    const values = {
      environment: 'development',
      revision: base,
      'compose-file': join(workDir, 'compose.yml'),
      ...overrides,
    };
    return [
      'rollback',
      ...Object.entries(values).map(([key, value]) => `--${key}=${value}`),
    ];
  }

  beforeEach(() => {
    gitDir = checkout;
    // The newest release migrated with 0001 and failed its health check.
    state.deployments = deployed(compatible, base);
    state.verifiedRollouts = () => Response.json([verified(base)]);
    serving(base);
  });

  it.each([
    'development',
    'staging',
    'production',
  ])('redeploys the verified %s images over the current schema', async (environment) => {
    state.environment = environment;
    state.compose.env = `CHURCH_ENVIRONMENT=${environment}\nSERVER_IMAGE=old-server\n`;

    const result = await runDeploy(rollbackArgs({ environment }));

    expect(result.exitCode).toBe(0);
    const lookup = requests.find((r) => r.path.startsWith(`${RECORDS}?`));
    expect(lookup?.path).toContain(`environment=verified-${environment}`);
    expect(lookup?.path).toContain(`sha=${base}`);
    // Same backup protection and Dokploy rollout; nothing is rebuilt or restored.
    expect(downstreamCalls()).toEqual([
      '/api/backup.manualBackupPostgres',
      '/api/compose.update',
      '/api/compose.deploy',
    ]);
    const update = requests.find((r) => r.path === '/api/compose.update');
    const { env } = JSON.parse(update?.body ?? '{}');
    expect(env).toContain(`SERVER_IMAGE=${ROLLBACK_SERVER}\n`);
    expect(env).toContain(`WEB_IMAGE=${ROLLBACK_WEB}\n`);
    const deploy = requests.find((r) => r.path === '/api/compose.deploy');
    expect(JSON.parse(deploy?.body ?? '{}').description).toBe(
      `rollback to revision ${base}`,
    );
    expect(result.summary).toContain(`Rolled back ${environment}`);
    expect(result.summary).toContain(base);
    expect(result.summary).toContain(ROLLBACK_SERVER);
  });

  it.each([
    [
      'the revision was never verified in the environment',
      () => {
        state.verifiedRollouts = () => Response.json([]);
      },
      'has no verified development rollout',
    ],
    [
      'the record names a mutable image',
      () => {
        state.verifiedRollouts = () =>
          Response.json([
            verified(base, {
              images: { server: 'ghcr.io/church/church-server:latest' },
            }),
          ]);
      },
      'does not name its immutable images',
    ],
    [
      'the record belongs to another environment',
      () => {
        state.verifiedRollouts = () =>
          Response.json([verified(base, { environment: 'staging' })]);
      },
      'does not name its immutable images',
    ],
    [
      'the database holds a migration not declared rollback-compatible',
      () => {
        state.deployments = deployed(incompatible, compatible, base);
      },
      '0002_change',
    ],
    [
      'Dokploy names no deployed revision, so the schema is unknown',
      () => {
        state.deployments = [];
      },
      'current schema is unknown',
    ],
    [
      'Dokploy deployed a revision this checkout does not know',
      () => {
        state.deployments = deployed('e'.repeat(40), base);
      },
      'cannot be read',
    ],
  ])('refuses before any backup or deployment when %s', async (_, fail, message) => {
    fail();

    const result = await runDeploy(rollbackArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(message);
    expect(result.output).toContain('Not rolling back');
    expect(downstreamCalls()).toEqual([]);
    expect(result.summary).toBe('');
  });

  it('refuses a target whose own migrations the database never received', async () => {
    state.deployments = deployed(base);
    state.verifiedRollouts = () => Response.json([verified(compatible)]);

    const result = await runDeploy(rollbackArgs({ revision: compatible }));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('0001_change');
    expect(result.output).toContain('deploy it forward instead');
    expect(downstreamCalls()).toEqual([]);
  });

  it('shares the deployment lock: refuses while a Dokploy deployment runs', async () => {
    state.deployments = [
      { ...deployed(compatible)[0], status: 'running' } as Deployment,
      ...deployed(compatible, base).slice(1),
    ];

    const result = await runDeploy(rollbackArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('still running');
    expect(downstreamCalls()).toEqual([]);
  });

  it('fails while the newer application keeps serving its revision', async () => {
    serving(compatible);

    const result = await runDeploy(rollbackArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(`did not become healthy on ${base}`);
    expect(result.output).toContain(`API serves revision ${compatible}`);
    expect(result.summary).toBe('');
  });

  it('fails while the API cannot reach its database', async () => {
    state.health = () =>
      Response.json(
        { status: 'unavailable', database: 'unavailable', revision: base },
        { status: 503 },
      );

    const result = await runDeploy(rollbackArgs());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('database unavailable');
  });

  it.each([
    ['an unknown environment', { environment: 'preview' }],
    ['an abbreviated revision', { revision: 'abc123' }],
  ])('refuses %s without contacting anything', async (_, overrides) => {
    const result = await runDeploy(rollbackArgs(overrides));

    expect(result.exitCode).toBe(2);
    expect(requests).toEqual([]);
  });
});
