import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  acquireValidateLock,
  holdValidateLock,
  type ValidateLock,
  validateLockPath,
} from '../../validation/validate-lock';

let dir: string;
const held: ValidateLock[] = [];
const children: { kill: () => void }[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'validate-lock-'));
});
afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const lock of held.splice(0)) lock.release();
  rmSync(dir, { force: true, recursive: true });
});

const take = async (
  overrides: Partial<Parameters<typeof acquireValidateLock>[0]> = {},
) => {
  const lock = await acquireValidateLock({
    dir,
    pollMs: 20,
    tier: 'affected',
    timeoutMs: 2_000,
    worktree: '/wt/a',
    ...overrides,
  });
  held.push(lock);
  return lock;
};

/** A real process that takes the lock, then holds it until stdin closes. */
const spawnHolder = async () => {
  const script = `
    const { acquireValidateLock } = await import(${JSON.stringify(join(import.meta.dir, '../../validation/validate-lock'))});
    await acquireValidateLock({ dir: ${JSON.stringify(dir)}, tier: 'validate', timeoutMs: 1000, worktree: '/wt/holder' });
    console.log('held');
    await new Promise(() => setInterval(() => {}, 1000));
  `;
  const child = Bun.spawn(['bun', '-e', script], {
    stderr: 'inherit',
    stdout: 'pipe',
  });
  children.push(child);
  const reader = child.stdout.getReader();
  await reader.read(); // 'held'
  return child;
};

describe('validate lock', () => {
  it('acquires a free slot without waiting and records the holder', async () => {
    const lock = await take();
    expect(lock.waitedMs).toBeLessThan(200);
    const record = JSON.parse(readFileSync(validateLockPath({ dir }), 'utf8'));
    expect(record).toMatchObject({
      pid: process.pid,
      tier: 'affected',
      worktree: '/wt/a',
    });
    expect(record.startedAt).toBeGreaterThan(0);
  });

  it('waits for a live holder, prints who holds it, then acquires after release', async () => {
    const holder = await spawnHolder();
    const lines: string[] = [];
    const pending = take({
      onWait: (line) => lines.push(line),
      timeoutMs: 10_000,
    });
    await Bun.sleep(150);
    holder.kill();
    const lock = await pending;
    expect(lock.waitedMs).toBeGreaterThanOrEqual(100);
    expect(lines[0]).toContain('/wt/holder');
    expect(lines[0]).toContain(`pid ${holder.pid}`);
    expect(lines[0]).toContain('validate');
  });

  it('takes over a slot whose holder process died', async () => {
    const holder = await spawnHolder();
    holder.kill('SIGKILL');
    await holder.exited;
    const lock = await take();
    expect(lock.waitedMs).toBeLessThan(500);
  });

  it('fails after the bounded wait naming the holder', async () => {
    const holder = await spawnHolder();
    try {
      await expect(take({ timeoutMs: 100 })).rejects.toThrow(
        new RegExp(`/wt/holder.*pid ${holder.pid}`),
      );
    } finally {
      holder.kill();
    }
  });

  // Regression: the slot's own signal handler exited before the lane runner
  // could stop its steps, so a killed gate left its test runs going while the
  // next gate started beside them on the same databases.
  it('keeps the slot until a signalled gate has stopped its running steps', async () => {
    const validation = join(import.meta.dir, '../../validation');
    const step =
      "console.log('step ' + process.pid); setInterval(() => {}, 1000)";
    const script = `
      const { acquireValidateLock } = await import(${JSON.stringify(`${validation}/validate-lock`)});
      const { runLanes } = await import(${JSON.stringify(`${validation}/run-lanes`)});
      await acquireValidateLock({ dir: ${JSON.stringify(dir)}, tier: 'affected', timeoutMs: 1000, worktree: '/wt/gate' });
      await runLanes({ lanes: [[{ args: ['-e', ${JSON.stringify(step)}], command: 'bun', label: 'step' }]] });
    `;
    const gate = Bun.spawn(['bun', '-e', script], {
      stderr: 'inherit',
      stdout: 'pipe',
    });
    children.push(gate);
    const reader = gate.stdout.getReader();
    const decoder = new TextDecoder();
    let printed = '';
    while (!/step (\d+)/.test(printed)) {
      const { done, value } = await reader.read();
      if (done) break;
      printed += decoder.decode(value);
    }
    const stepPid = Number(printed.match(/step (\d+)/)?.[1]);
    children.push({
      kill: () => {
        try {
          process.kill(stepPid, 'SIGKILL');
        } catch {
          // Already stopped: the expected outcome.
        }
      },
    });

    gate.kill('SIGTERM');
    await gate.exited;

    expect(() => process.kill(stepPid, 0)).toThrow();
    expect(existsSync(validateLockPath({ dir }))).toBe(false);
  });

  it('frees the slot when the gate fails or release is called twice', async () => {
    const first = await take();
    first.release();
    first.release();
    const second = await take();
    expect(second.waitedMs).toBeLessThan(200);
  });
});

describe('holdValidateLock', () => {
  it('skips the machine-wide slot under CI', async () => {
    const previous = process.env.CI;
    process.env.CI = 'true';
    try {
      expect(await holdValidateLock({ tier: 'affected' })).toMatchObject({
        waitedMs: 0,
      });
    } finally {
      if (previous === undefined) delete process.env.CI;
      else process.env.CI = previous;
    }
  });
});
