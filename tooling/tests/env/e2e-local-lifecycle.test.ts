import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Drives the real local E2E lifecycle wrapper with no-op shell commands in a
 * throwaway repository whose two worktrees share one Git directory. Asserts
 * only what is observable: command ordering, exit status, and which
 * processes are still alive afterwards.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const LIFECYCLE_SCRIPT = resolve(
  REPO_ROOT,
  'tooling/env/e2e-local-lifecycle.ts',
);

let sandbox: string;
let primary: string;
let feature: string;
let log: string;

interface GitInput {
  args: string[];
  cwd: string;
}

function git(input: GitInput): void {
  execFileSync('git', input.args, { cwd: input.cwd, stdio: 'ignore' });
}

interface LifecycleInput {
  cwd: string;
  script: string;
  env?: Record<string, string>;
}

/** Environment without CI markers, so the local lock applies by default. */
function localEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'CI') env[key] = value;
  }
  return env;
}

function startLifecycle(input: LifecycleInput) {
  return Bun.spawn(['bun', LIFECYCLE_SCRIPT, 'sh', '-c', input.script], {
    cwd: input.cwd,
    env: { ...localEnv(), ...input.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function runLifecycle(input: LifecycleInput) {
  return spawnSync('bun', [LIFECYCLE_SCRIPT, 'sh', '-c', input.script], {
    cwd: input.cwd,
    env: { ...localEnv(), ...input.env },
    encoding: 'utf8',
  });
}

interface WaitForFileInput {
  path: string;
}

async function waitForFile(input: WaitForFileInput): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!existsSync(input.path)) {
    if (Date.now() > deadline) throw new Error(`${input.path} never appeared`);
    await Bun.sleep(10);
  }
}

interface PidInput {
  pid: number;
}

/** A killed orphan may linger as a zombie until init reaps it: not alive. */
function isAlive(input: PidInput): boolean {
  try {
    const stat = readFileSync(`/proc/${input.pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2)[0] !== 'Z';
  } catch {
    return false;
  }
}

function readPid(input: WaitForFileInput): number {
  return Number(readFileSync(input.path, 'utf8').trim());
}

function logLines(): string[] {
  return readFileSync(log, 'utf8').trim().split('\n');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-e2e-lifecycle-'));
  primary = join(sandbox, 'church');
  feature = join(sandbox, 'church.feature');
  log = join(sandbox, 'order.log');

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
    args: ['worktree', 'add', '-q', '-b', 'feature', feature],
    cwd: primary,
  });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('local E2E lifecycle', () => {
  it('runs one lifecycle at a time across worktrees; the waiter starts nothing until the holder ends', async () => {
    const ready = join(sandbox, 'holder-started');
    const holder = startLifecycle({
      cwd: primary,
      script: `echo holder-start >> ${log}; touch ${ready}; sleep 1; echo holder-end >> ${log}`,
    });
    await waitForFile({ path: ready });

    const waiter = runLifecycle({
      cwd: feature,
      script: `echo waiter-start >> ${log}`,
    });

    expect(await holder.exited).toBe(0);
    expect(waiter.status, waiter.stderr).toBe(0);
    expect(waiter.stderr).toContain('Waiting for the local E2E lock');
    expect(logLines()).toEqual(['holder-start', 'holder-end', 'waiter-start']);
  });

  it('propagates the command exit status and releases the lock after a failure', () => {
    const failed = runLifecycle({ cwd: primary, script: 'exit 3' });
    const next = runLifecycle({ cwd: feature, script: `echo next >> ${log}` });

    expect(failed.status).toBe(3);
    expect(next.status, next.stderr).toBe(0);
    expect(next.stderr).not.toContain('Waiting for the local E2E lock');
  });

  it('removes processes that escaped the command before releasing the lock', async () => {
    const pidFile = join(sandbox, 'escaped.pid');

    // A new session escapes the command's process group, like the Varlock
    // child behind a Playwright webServer.
    const result = runLifecycle({
      cwd: primary,
      script: `setsid sh -c 'echo $$ > ${pidFile}; exec sleep 30' > /dev/null 2>&1 & while [ ! -s ${pidFile} ]; do sleep 0.01; done`,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(isAlive({ pid: readPid({ path: pidFile }) })).toBe(false);
  });

  it('releases a blocked waiter when the holder dies, and clears what the holder left running', async () => {
    const pidFile = join(sandbox, 'holder-child.pid');
    const holder = startLifecycle({
      cwd: primary,
      script: `sh -c 'echo $$ > ${pidFile}; exec sleep 30'`,
    });
    await waitForFile({ path: pidFile });
    const orphan = readPid({ path: pidFile });

    const waiter = startLifecycle({
      cwd: feature,
      script: `echo waiter-start >> ${log}`,
    });
    await Bun.sleep(300);
    expect(existsSync(log)).toBe(false);

    holder.kill('SIGKILL');
    await holder.exited;

    expect(await waiter.exited).toBe(0);
    expect(await new Response(waiter.stderr).text()).toContain(
      'Waiting for the local E2E lock',
    );
    expect(logLines()).toEqual(['waiter-start']);
    expect(isAlive({ pid: orphan })).toBe(false);
  });

  it("leaves another repository's E2E processes alone", async () => {
    const other = join(sandbox, 'other-repo');
    const pidFile = join(sandbox, 'other-child.pid');
    execFileSync('git', ['init', '-q', other]);
    const otherRun = startLifecycle({
      cwd: other,
      script: `sh -c 'echo $$ > ${pidFile}; exec sleep 30'`,
    });
    await waitForFile({ path: pidFile });
    const otherChild = readPid({ path: pidFile });

    const result = runLifecycle({ cwd: primary, script: 'true' });
    const survived = isAlive({ pid: otherChild });
    otherRun.kill('SIGTERM');
    await otherRun.exited;

    expect(result.status, result.stderr).toBe(0);
    expect(survived).toBe(true);
  });

  it('forwards an interrupt to the command exactly once', async () => {
    const ready = join(sandbox, 'trap-ready');
    const run = startLifecycle({
      cwd: primary,
      script: `trap 'echo interrupted >> ${log}; exit 130' INT; touch ${ready}; sleep 5 & wait`,
    });
    await waitForFile({ path: ready });

    run.kill('SIGINT');

    expect(await run.exited).toBe(130);
    expect(logLines()).toEqual(['interrupted']);
  });

  it('does not take the local lock in CI', async () => {
    const ready = join(sandbox, 'ci-holder-started');
    const holder = startLifecycle({
      cwd: primary,
      env: { CI: 'true' },
      script: `touch ${ready}; sleep 1; echo holder-end >> ${log}`,
    });
    await waitForFile({ path: ready });

    const concurrent = runLifecycle({
      cwd: feature,
      env: { CI: 'true' },
      script: `echo concurrent >> ${log}`,
    });
    await holder.exited;

    expect(concurrent.status, concurrent.stderr).toBe(0);
    expect(logLines()).toEqual(['concurrent', 'holder-end']);
  });
});
