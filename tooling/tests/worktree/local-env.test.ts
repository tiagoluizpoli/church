import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Drives the real `env:local` command against a throwaway repository with a
 * primary checkout and two linked worktrees, asserting only what the command
 * leaves behind: its exit status and each worktree's `.env.local`.
 */

const LOCAL_ENV_SCRIPT = resolve(
  import.meta.dir,
  '../../worktree/local-env.ts',
);

let sandbox: string;
let primary: string;
let featureA: string;
let featureB: string;

interface RunInput {
  cwd: string;
  args?: string[];
}

interface RunResult {
  status: number | null;
  output: string;
}

function run(input: RunInput): RunResult {
  const result = spawnSync('bun', [LOCAL_ENV_SCRIPT, ...(input.args ?? [])], {
    cwd: input.cwd,
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

interface WorktreeInput {
  cwd: string;
}

function localEnvPath(input: WorktreeInput): string {
  return join(input.cwd, '.env.local');
}

function readRaw(input: WorktreeInput): string {
  return readFileSync(localEnvPath(input), 'utf8');
}

function readValues(input: WorktreeInput): Record<string, string> {
  return Object.fromEntries(
    readRaw(input)
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ]),
  );
}

function portsOf(values: Record<string, string>): number[] {
  return [
    values.CHURCH_SERVER_PORT,
    values.CHURCH_WEB_PORT,
    values.PW_SERVER_PORT,
    values.PW_WEB_PORT,
  ].map(Number);
}

function generate(input: WorktreeInput): Record<string, string> {
  const result = run({ cwd: input.cwd });
  expect(result.status, result.output).toBe(0);
  return readValues(input);
}

/** The ports a worktree would get on its own, then forgotten again. */
function probeFreshAllocation(input: WorktreeInput): Record<string, string> {
  const values = generate(input);
  rmSync(localEnvPath(input));
  return values;
}

interface OccupyInput {
  port: number;
  hostname?: string;
}

interface Listener {
  stop: () => void;
}

function occupy(input: OccupyInput): Listener {
  return Bun.listen({
    hostname: input.hostname ?? '0.0.0.0',
    port: input.port,
    socket: { data() {} },
  });
}

/** Occupies the port unless something on the host already does. */
function ensureOccupied(input: OccupyInput): Listener {
  try {
    return occupy(input);
  } catch {
    return { stop: () => {} };
  }
}

interface GitInput {
  args: string[];
  cwd: string;
}

function git(input: GitInput): void {
  execFileSync('git', input.args, { cwd: input.cwd, stdio: 'ignore' });
}

function lockPath(): string {
  return join(primary, '.git', 'church-local-env.lock');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-local-env-'));
  primary = join(sandbox, 'church');
  featureA = join(sandbox, 'church.feature-a');
  featureB = join(sandbox, 'church.feature-b');

  execFileSync('git', ['init', '-q', '-b', 'develop', primary]);
  git({
    args: [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    ],
    cwd: primary,
  });
  git({
    args: ['worktree', 'add', '-q', '-b', 'feature-a', featureA],
    cwd: primary,
  });
  git({
    args: ['worktree', 'add', '-q', '-b', 'Feature/B', featureB],
    cwd: primary,
  });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('env:local', () => {
  it('writes the worktree identity, its ports, the derived URL set and an auth secret', () => {
    const values = generate({ cwd: featureA });
    const [server, web, e2eServer, e2eWeb] = portsOf(values);

    expect(values.CHURCH_WORKTREE).toBe('feature_a');
    for (const port of [server, web, e2eServer, e2eWeb]) {
      expect(port).toBeGreaterThanOrEqual(20000);
      expect(port).toBeLessThan(32000);
    }
    expect(new Set([server, web, e2eServer, e2eWeb]).size).toBe(4);
    expect(values.BETTER_AUTH_URL).toBe(`http://localhost:${server}`);
    expect(values.VITE_SERVER_URL).toBe(`http://localhost:${server}`);
    expect(values.CORS_ORIGIN).toBe(`http://localhost:${web}`);
    expect(values.BETTER_AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives a hashed identity for a branch the readable form would alter', () => {
    expect(generate({ cwd: featureB }).CHURCH_WORKTREE).toMatch(
      /^feature_b__[0-9a-f]{8}$/,
    );
  });

  it('reproduces the same file when rerun', () => {
    generate({ cwd: featureA });
    const first = readRaw({ cwd: featureA });

    generate({ cwd: featureA });

    expect(readRaw({ cwd: featureA })).toBe(first);
  });

  it('gives each worktree its own secret and ports', () => {
    const a = generate({ cwd: featureA });
    const b = generate({ cwd: featureB });

    expect(a.BETTER_AUTH_SECRET).not.toBe(b.BETTER_AUTH_SECRET);
    const overlap = portsOf(a).filter((port) => portsOf(b).includes(port));
    expect(overlap).toEqual([]);
  });

  it('skips a port another worktree has already claimed', () => {
    const wanted = probeFreshAllocation({ cwd: featureB });
    generate({ cwd: featureA });
    writeFileSync(
      localEnvPath({ cwd: featureA }),
      readRaw({ cwd: featureA }).replace(
        /^CHURCH_SERVER_PORT=.*$/m,
        `CHURCH_SERVER_PORT=${wanted.CHURCH_SERVER_PORT}`,
      ),
    );

    const b = generate({ cwd: featureB });

    expect(b.CHURCH_SERVER_PORT).not.toBe(wanted.CHURCH_SERVER_PORT);
  });

  it('probes past a port bound on the host and keeps the probed port afterwards', () => {
    const wanted = probeFreshAllocation({ cwd: featureA });
    const listener = occupy({ port: Number(wanted.CHURCH_WEB_PORT) });

    let probed: Record<string, string>;
    try {
      probed = generate({ cwd: featureA });
    } finally {
      listener.stop();
    }

    expect(probed.CHURCH_WEB_PORT).not.toBe(wanted.CHURCH_WEB_PORT);
    expect(generate({ cwd: featureA }).CHURCH_WEB_PORT).toBe(
      probed.CHURCH_WEB_PORT,
    );
  });

  it('leaves the file untouched on revalidation while every port is still free', () => {
    generate({ cwd: featureA });
    const before = readRaw({ cwd: featureA });

    expect(run({ cwd: featureA, args: ['--revalidate'] }).status).toBe(0);

    expect(readRaw({ cwd: featureA })).toBe(before);
  });

  it('reallocates the port set and every dependent URL when a persisted port is taken', () => {
    const before = generate({ cwd: featureA });
    const listener = occupy({ port: Number(before.CHURCH_SERVER_PORT) });

    let result: RunResult;
    try {
      result = run({ cwd: featureA, args: ['--revalidate'] });
    } finally {
      listener.stop();
    }

    expect(result.status, result.output).toBe(0);
    const after = readValues({ cwd: featureA });
    const [server, web] = portsOf(after);
    expect(after.CHURCH_SERVER_PORT).not.toBe(before.CHURCH_SERVER_PORT);
    expect(after.BETTER_AUTH_URL).toBe(`http://localhost:${server}`);
    expect(after.VITE_SERVER_URL).toBe(`http://localhost:${server}`);
    expect(after.CORS_ORIGIN).toBe(`http://localhost:${web}`);
    expect(after.CHURCH_WORKTREE).toBe(before.CHURCH_WORKTREE);
    expect(after.BETTER_AUTH_SECRET).toBe(before.BETTER_AUTH_SECRET);
  });

  it('refuses to overwrite a .env.local it did not generate', () => {
    writeFileSync(localEnvPath({ cwd: featureA }), 'MY_OVERRIDE=1\n');

    const result = run({ cwd: featureA });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('.env.local');
    expect(readRaw({ cwd: featureA })).toBe('MY_OVERRIDE=1\n');
  });

  it('keeps the primary checkout on the develop identity and its established ports', () => {
    const values = generate({ cwd: primary });

    expect(values.CHURCH_WORKTREE).toBe('develop');
    expect(portsOf(values)).toEqual([3100, 3101, 4100, 4101]);
    expect(existsSync(localEnvPath({ cwd: featureA }))).toBe(false);
  });

  it('probes past a port bound only on IPv6 loopback', () => {
    const wanted = probeFreshAllocation({ cwd: featureA });
    const listener = occupy({
      port: Number(wanted.CHURCH_SERVER_PORT),
      hostname: '::1',
    });

    let probed: Record<string, string>;
    try {
      probed = generate({ cwd: featureA });
    } finally {
      listener.stop();
    }

    expect(probed.CHURCH_SERVER_PORT).not.toBe(wanted.CHURCH_SERVER_PORT);
  });

  it('refuses an identity another active worktree already holds', () => {
    generate({ cwd: featureA });
    const detached = join(sandbox, 'elsewhere', 'feature-a');
    git({
      args: ['worktree', 'add', '-q', '--detach', detached],
      cwd: primary,
    });

    const result = run({ cwd: detached });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('feature_a');
    expect(existsSync(localEnvPath({ cwd: detached }))).toBe(false);
  });

  it('fails revalidation when the primary checkout cannot keep its established ports', () => {
    generate({ cwd: primary });
    const listener = ensureOccupied({ port: 3100 });

    let result: RunResult;
    try {
      result = run({ cwd: primary, args: ['--revalidate'] });
    } finally {
      listener.stop();
    }

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('3100');
  });

  it('waits for the shared allocation lock before generating', async () => {
    const ready = join(sandbox, 'lock-held');
    const holder = Bun.spawn([
      'flock',
      lockPath(),
      'sh',
      '-c',
      `touch ${ready} && sleep 1`,
    ]);
    while (!existsSync(ready)) await Bun.sleep(10);

    const startedAt = performance.now();
    const values = generate({ cwd: featureA });
    const waitedMs = performance.now() - startedAt;
    await holder.exited;

    expect(waitedMs).toBeGreaterThanOrEqual(800);
    expect(values.CHURCH_WORKTREE).toBe('feature_a');
  });

  it('warns about legacy root .env values the generated file now overrides', () => {
    writeFileSync(
      join(primary, '.env'),
      'VITE_SERVER_URL="http://192.168.0.200:3100"\nBETTER_AUTH_URL=http://localhost:3100\n',
    );

    const result = run({ cwd: primary });

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('VITE_SERVER_URL');
    expect(result.output).not.toContain('BETTER_AUTH_URL');
    expect(result.output).not.toContain('192.168.0.200');
  });

  it('names a checkout without commits after its unborn branch', () => {
    const fresh = join(sandbox, 'fresh');
    execFileSync('git', ['init', '-q', '-b', 'develop', fresh]);

    expect(generate({ cwd: fresh }).CHURCH_WORKTREE).toBe('develop');
  });

  it('reports a failure outside a Git checkout without a stack trace', () => {
    const plain = join(sandbox, 'not-a-repo');
    mkdirSync(plain);

    const result = run({ cwd: plain });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('✖ env:local failed');
    expect(result.output).not.toContain('    at ');
  });
});
