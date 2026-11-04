import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** One validation gate per machine: a per-user record shared by every worktree. */
export const DEFAULT_LOCK_DIR = join(homedir(), '.local', 'state', 'church');
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 2_000;
const STATUS_EVERY_MS = 30_000;

interface HolderRecord {
  pid: number;
  /** Epoch ms; read from the performance clock because raw Date is banned outside @church/time. */
  startedAt: number;
  tier: string;
  worktree: string;
}

export interface ValidateLock {
  release: () => void;
  waitedMs: number;
}

interface DirInput {
  dir?: string;
}

export interface AcquireValidateLockInput extends DirInput {
  onWait?: (line: string) => void;
  pollMs?: number;
  tier: string;
  timeoutMs?: number;
  worktree: string;
}

export function validateLockPath({ dir = DEFAULT_LOCK_DIR }: DirInput): string {
  return join(dir, 'validate.lock.json');
}

function readHolder({ path }: { path: string }): HolderRecord | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as HolderRecord;
  } catch {
    return null; // missing, or mid-write: treat as free/unknown and retry
  }
}

// shortcut: a recycled PID looks alive, so such a record waits until timeout; upgrade if it bites.
function isAlive({ pid }: { pid: number }): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const epochMs = () => performance.timeOrigin + performance.now();

function describeHolder({ holder }: { holder: HolderRecord }): string {
  const minutes = ((epochMs() - holder.startedAt) / 60_000).toFixed(1);
  return `${holder.worktree} (pid ${holder.pid}, ${holder.tier}, started ${minutes} min ago)`;
}

/**
 * Takes the machine-wide validate slot, waiting (with status lines) up to
 * `timeoutMs`. A record whose process died is taken over. The slot is
 * released on exit and on SIGINT/SIGTERM.
 */
export async function acquireValidateLock({
  dir = DEFAULT_LOCK_DIR,
  onWait = (line) => console.log(line),
  pollMs = DEFAULT_POLL_MS,
  tier,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  worktree,
}: AcquireValidateLockInput): Promise<ValidateLock> {
  const path = validateLockPath({ dir });
  mkdirSync(dir, { recursive: true });
  const record: HolderRecord = {
    pid: process.pid,
    startedAt: epochMs(),
    tier,
    worktree,
  };
  const started = performance.now();
  let lastStatus = 0;

  for (;;) {
    try {
      writeFileSync(path, JSON.stringify(record), { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const holder = readHolder({ path });
    if (holder && !isAlive({ pid: holder.pid })) {
      onWait(
        `Taking over the validate slot from dead holder ${describeHolder({ holder })}.`,
      );
      rmSync(path, { force: true });
      continue;
    }
    const now = performance.now();
    if (now - started >= timeoutMs) {
      throw new Error(
        `Gave up waiting ${Math.round((now - started) / 1000)}s for the validate slot (${path}); held by ${holder ? describeHolder({ holder }) : 'an unreadable record'}.`,
      );
    }
    if (now - lastStatus >= STATUS_EVERY_MS || lastStatus === 0) {
      lastStatus = now;
      onWait(
        `⏳ Waiting for the validate slot: held by ${holder ? describeHolder({ holder }) : 'an unknown run'}.`,
      );
    }
    await Bun.sleep(pollMs);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off('exit', release);
    // Only remove our own record, never a successor's.
    if (readHolder({ path })?.pid === process.pid)
      rmSync(path, { force: true });
  };
  process.once('exit', release);
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const) {
    process.once(signal, () => {
      release();
      process.exit(code);
    });
  }
  return { release, waitedMs: performance.now() - started };
}

/** Takes the slot for a gate run from the repository root; the pre-push hook sets a shorter wait through the environment. */
export async function holdValidateLock({
  tier,
}: {
  tier: string;
}): Promise<ValidateLock> {
  const fromEnv = Number(process.env.CHURCH_VALIDATE_LOCK_TIMEOUT_MS);
  return acquireValidateLock({
    timeoutMs: fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS,
    tier,
    worktree: process.cwd(),
  });
}

export function formatLockWait({ waitedMs }: { waitedMs: number }): string {
  return `Waited ${(waitedMs / 1000).toFixed(1)}s for the validate slot.`;
}
