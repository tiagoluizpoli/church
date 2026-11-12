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
 * released on exit, which a signalled gate reaches only after its steps stop.
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
  // No signal handler here: exiting on a signal would free the slot before the
  // lane runner stops its steps. A gate killed outright leaves a dead-pid record
  // that the next run takes over.
  process.once('exit', release);
  return { release, waitedMs: performance.now() - started };
}

export interface HoldValidateLockInput {
  tier: string;
}

export interface FormatLockWaitInput {
  waitedMs: number;
}

/**
 * Takes the slot for a gate run from the repository root; the pre-push hook
 * sets a shorter wait through the environment. CI runs on its own runner, so
 * only local runs queue for the slot.
 */
export async function holdValidateLock({
  tier,
}: HoldValidateLockInput): Promise<ValidateLock> {
  if (process.env.CI) return { release: () => {}, waitedMs: 0 };
  const fromEnv = Number(process.env.CHURCH_VALIDATE_LOCK_TIMEOUT_MS);
  return acquireValidateLock({
    timeoutMs: fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS,
    tier,
    worktree: process.cwd(),
  });
}

export function formatLockWait({ waitedMs }: FormatLockWaitInput): string {
  return `Waited ${(waitedMs / 1000).toFixed(1)}s for the validate slot.`;
}
