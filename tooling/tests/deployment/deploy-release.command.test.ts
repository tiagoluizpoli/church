import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real `deploy.ts release` routing (#882) against a scratch git
 * checkout and a stand-in GitHub API that resolves the tag and answers
 * whether its commit belongs to master.
 */

const SCRIPT = resolve(import.meta.dir, '../../deployment/deploy.ts');
const GIT = [
  'git',
  '-c',
  'user.name=Release Test',
  '-c',
  'user.email=release@example.test',
  '-c',
  'commit.gpgsign=false',
];

interface Release {
  tag: string;
  prerelease: boolean;
  draft: boolean;
}

interface Event {
  action: string;
  release: Record<string, unknown>;
}

interface State {
  tagCommit: string;
  // GitHub compare status of the tagged commit against master.
  masterComparison: string;
}

let state: State;
let paths: string[];
let server: ReturnType<typeof Bun.serve>;
let workDir: string;
let checkout: string;

function git(args: string[]): string {
  const result = Bun.spawnSync([...GIT, ...args], { cwd: checkout });
  if (result.exitCode !== 0) throw new Error(String(result.stderr));
  return String(result.stdout).trim();
}

interface CommitInput {
  version: string;
  source: string;
}

function commit(input: CommitInput): string {
  const manifest = { name: 'church', version: input.version, private: true };
  writeFileSync(
    join(checkout, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(join(checkout, 'app.ts'), input.source);
  git(['add', '.']);
  git(['commit', '-q', '-m', `version ${input.version}`]);
  return git(['rev-parse', 'HEAD']);
}

beforeEach(() => {
  paths = [];
  workDir = mkdtempSync(join(tmpdir(), 'deploy-release-'));
  checkout = join(workDir, 'checkout');
  Bun.spawnSync(['git', 'init', '-q', checkout]);
  state = {
    tagCommit: commit({ version: '1.2.0-rc.1', source: 'export {};\n' }),
    masterComparison: 'behind',
  };
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      paths.push(pathname);
      if (pathname.startsWith('/repos/church/app/commits/')) {
        return Response.json({ sha: state.tagCommit });
      }
      if (
        pathname === `/repos/church/app/compare/master...${state.tagCommit}`
      ) {
        return Response.json({ status: state.masterComparison });
      }
      return new Response('not found', { status: 404 });
    },
  });
});

afterEach(() => {
  server.stop(true);
  rmSync(workDir, { recursive: true, force: true });
});

function event(release: Partial<Release> = {}, action = 'published'): Event {
  const { tag, ...flags } = {
    tag: 'v1.2.0-rc.1',
    prerelease: true,
    draft: false,
    ...release,
  };
  // biome-ignore lint/style/useNamingConvention: GitHub's payload field
  return { action, release: { tag_name: tag, ...flags } };
}

async function route(payload: Event, eventName = 'release') {
  const eventPath = join(workDir, 'event.json');
  const outputPath = join(workDir, 'github-output');
  writeFileSync(eventPath, JSON.stringify(payload));
  writeFileSync(outputPath, '');
  const child = Bun.spawn(['bun', '--no-env-file', SCRIPT, 'release'], {
    cwd: checkout,
    env: {
      PATH: process.env.PATH,
      GITHUB_API_URL: server.url.origin,
      GITHUB_REPOSITORY: 'church/app',
      GITHUB_TOKEN: 'github-token',
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const outputs = Object.fromEntries(
    readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=') as [string, string]),
  );
  return { exitCode, output: `${stdout}${stderr}`, outputs };
}

describe('deploy release', () => {
  it('selects staging for a published rc prerelease on master', async () => {
    const result = await route(event());

    expect(result.exitCode).toBe(0);
    expect(result.outputs).toMatchObject({
      environment: 'staging',
      tag: 'v1.2.0-rc.1',
      version: '1.2.0-rc.1',
      revision: state.tagCommit,
    });
    expect(result.outputs.content).toMatch(/^[0-9a-f]{64}$/);
  });

  it('selects production for a published stable release on master', async () => {
    state.tagCommit = commit({ version: '1.2.0', source: 'export {};\n' });

    const result = await route(event({ tag: 'v1.2.0', prerelease: false }));

    expect(result.exitCode).toBe(0);
    expect(result.outputs.environment).toBe('production');
  });

  it('keeps the content identity across a version-only change', async () => {
    const candidate = await route(event());
    state.tagCommit = commit({ version: '1.2.0', source: 'export {};\n' });

    const stable = await route(event({ tag: 'v1.2.0', prerelease: false }));

    expect(stable.outputs.revision).not.toBe(candidate.outputs.revision);
    expect(stable.outputs.content).toBe(candidate.outputs.content);
  });

  it('changes the content identity when application content changes', async () => {
    const candidate = await route(event());
    state.tagCommit = commit({
      version: '1.2.0',
      source: 'export const changed = true;\n',
    });

    const stable = await route(event({ tag: 'v1.2.0', prerelease: false }));

    expect(stable.outputs.content).not.toBe(candidate.outputs.content);
  });

  it.each([
    ['an rc tag published as a stable release', { prerelease: false }],
    [
      'a stable tag published as a prerelease',
      { tag: 'v1.2.0', prerelease: true },
    ],
  ])('refuses %s', async (_, release) => {
    const result = await route(event(release));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('prerelease');
    expect(result.outputs).toEqual({});
  });

  it.each([
    'v1.2',
    '1.2.0-rc.1',
    'v1.2.0-rc.0',
    'v01.2.0',
    'v1.2.0-beta.1',
    'v1.2.0-rc.1-hotfix',
  ])('refuses the malformed tag %s before asking GitHub', async (tag) => {
    const result = await route(event({ tag: tag }));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('not vX.Y.Z or vX.Y.Z-rc.N');
    expect(paths).toEqual([]);
    expect(result.outputs).toEqual({});
  });

  it.each([
    'ahead',
    'diverged',
  ])('refuses a tagged commit that is %s of master', async (comparison) => {
    state.masterComparison = comparison;

    const result = await route(event());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('does not belong to master');
    expect(result.outputs).toEqual({});
  });

  it('refuses a tag whose commit records another version', async () => {
    state.tagCommit = commit({ version: '1.1.0', source: 'export {};\n' });

    const result = await route(event());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('records version 1.1.0');
    expect(result.outputs).toEqual({});
  });

  it('refuses a draft release', async () => {
    const result = await route(event({ draft: true }));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('draft');
    expect(result.outputs).toEqual({});
  });

  it.each([
    ['a release edit', event({}, 'edited'), 'release'],
    ['a tag push', event(), 'push'],
  ])('refuses %s', async (_, payload, eventName) => {
    const result = await route(payload, eventName);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('only a published release deploys');
    expect(paths).toEqual([]);
  });
});
