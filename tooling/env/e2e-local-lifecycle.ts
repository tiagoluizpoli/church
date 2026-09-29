import { openSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runs one local E2E command (Playwright, its browser and both webServers)
 * at a time across every worktree of this repository, so parallel runs
 * cannot exhaust the host.
 *
 *   bun tooling/env/e2e-local-lifecycle.ts <command> [args...]
 *
 * The lock is a kernel `flock` on a file in the shared Git directory, held
 * by this process for the whole command: the kernel releases it on success,
 * failure, interruption, or process death, so it never needs repair. A
 * second run waits and starts nothing until then.
 *
 * Every process the command starts inherits a lifecycle marker naming this
 * lock. Before the lock is released, any process still carrying it (a
 * webServer that escaped its process group) is stopped; the next holder does
 * the same for whatever a killed holder left behind. Processes marked for
 * another repository's lock are never touched. Hosted CI jobs share neither
 * host nor Git directory, so CI runs the command without the lock.
 */

const LOCK_FILE = 'church-e2e.lock';
const LIFECYCLE_MARKER = 'CHURCH_E2E_LIFECYCLE';
const LOCK_FD = 3;
const STOP_GRACE_MS = 5_000;
const STOP_POLL_MS = 50;
const STOP_ROUNDS = 5;
const FORWARDED_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const COMMAND_NOT_FOUND = 127;

interface CommandInput {
  command: string[];
}

interface DescribeErrorInput {
  error: unknown;
}

function describeError(input: DescribeErrorInput): string {
  return input.error instanceof Error
    ? input.error.message
    : String(input.error);
}

function sharedGitDir(): string {
  return Bun.spawnSync([
    'git',
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ])
    .stdout.toString()
    .trim();
}

interface RunFlockInput {
  args: string[];
  /** This process's fd for the lock file; flock(1) receives it as fd 3. */
  lockFd: number;
}

/** Runs flock(1) on the open file description this process keeps, so the
 * lock stays held by this process after flock(1) exits. */
function runFlock(input: RunFlockInput): Promise<number> {
  try {
    return Bun.spawn(['flock', ...input.args, String(LOCK_FD)], {
      stdio: ['ignore', 'inherit', 'inherit', input.lockFd],
    }).exited;
  } catch (error) {
    throw new Error(`could not run flock: ${describeError({ error })}`);
  }
}

/** Takes the lock on an fd this process keeps open (children never inherit
 * it, so a leaked child cannot hold the next run back) and returns the lock
 * file's path. */
async function acquireLock(): Promise<string> {
  const gitDir = sharedGitDir();

  if (!gitDir) {
    throw new Error('the local E2E lock needs a Git repository.');
  }

  const lockPath = join(gitDir, LOCK_FILE);
  const lockFd = openSync(lockPath, 'a');

  if ((await runFlock({ args: ['-n'], lockFd })) === 0) return lockPath;

  console.error(
    `⏳ Waiting for the local E2E lock (${lockPath}): another local E2E run holds it.`,
  );

  const status = await runFlock({ args: [], lockFd });

  if (status !== 0) {
    throw new Error(`flock exited with status ${status}.`);
  }

  return lockPath;
}

interface ProcessStatusInput {
  pid: number;
}

function isRunning(input: ProcessStatusInput): boolean {
  try {
    const stat = readFileSync(`/proc/${input.pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2)[0] !== 'Z';
  } catch {
    return false;
  }
}

interface LockPathInput {
  lockPath: string;
}

interface CarriesMarkerInput extends ProcessStatusInput, LockPathInput {}

function carriesMarker(input: CarriesMarkerInput): boolean {
  try {
    return readFileSync(`/proc/${input.pid}/environ`, 'utf8')
      .split('\0')
      .includes(`${LIFECYCLE_MARKER}=${input.lockPath}`);
  } catch {
    return false;
  }
}

function markedProcesses(input: LockPathInput): number[] {
  let entries: string[];

  try {
    entries = readdirSync('/proc');
  } catch {
    return [];
  }

  return entries
    .filter((entry) => /^\d+$/.test(entry))
    .map(Number)
    .filter(
      (pid) =>
        pid !== process.pid && carriesMarker({ pid, lockPath: input.lockPath }),
    );
}

interface SignalAllInput {
  pids: number[];
  signal: NodeJS.Signals;
}

function signalAll(input: SignalAllInput): void {
  for (const pid of input.pids) {
    try {
      process.kill(pid, input.signal);
    } catch {
      // Already gone.
    }
  }
}

/** Stops every process this lock's lifecycles started that is still
 * running: SIGTERM first, SIGKILL after a grace period, rescanning so a
 * process started while the others shut down is stopped too. */
async function stopLifecycleProcesses(input: LockPathInput): Promise<void> {
  for (let round = 0; round < STOP_ROUNDS; round += 1) {
    const pids = markedProcesses(input);

    if (pids.length === 0) return;

    console.error(
      `⚠ Stopping ${pids.length} leftover local E2E process(es): ${pids.join(', ')}.`,
    );
    signalAll({ pids, signal: 'SIGTERM' });

    let running = pids;

    for (
      let waited = 0;
      running.length > 0 && waited < STOP_GRACE_MS;
      waited += STOP_POLL_MS
    ) {
      await Bun.sleep(STOP_POLL_MS);
      running = running.filter((pid) => isRunning({ pid }));
    }

    signalAll({ pids: running, signal: 'SIGKILL' });
  }

  console.error(
    `⚠ Local E2E processes kept starting after ${STOP_ROUNDS} attempts to stop them: ${markedProcesses(input).join(', ')}.`,
  );
}

interface RunCommandInput extends CommandInput {
  env: NodeJS.ProcessEnv;
}

/** Runs the command to completion in its own process group and returns its
 * exit status. A terminal's Ctrl-C, or a signal from Turbo, reaches only this
 * process, which forwards it exactly once: Playwright force-quits instead of
 * tearing down when it receives a second interrupt. */
async function runCommand(input: RunCommandInput): Promise<number> {
  let child: Bun.Subprocess;

  try {
    child = Bun.spawn(input.command, {
      stdio: ['inherit', 'inherit', 'inherit'],
      env: input.env,
      detached: true,
    });
  } catch (error) {
    console.error(
      `✖ could not start ${input.command[0]}: ${describeError({ error })}`,
    );
    return COMMAND_NOT_FOUND;
  }

  const forward = (signal: NodeJS.Signals) => child.kill(signal);

  for (const signal of FORWARDED_SIGNALS) process.on(signal, forward);

  try {
    // Resolves to 128 + the signal number when a signal ended the command.
    return await child.exited;
  } finally {
    for (const signal of FORWARDED_SIGNALS) process.off(signal, forward);
  }
}

async function runLocally(input: CommandInput): Promise<number> {
  const lockPath = await acquireLock();
  await stopLifecycleProcesses({ lockPath });

  try {
    return await runCommand({
      command: input.command,
      env: { ...process.env, [LIFECYCLE_MARKER]: lockPath },
    });
  } finally {
    await stopLifecycleProcesses({ lockPath });
  }
}

async function main(): Promise<void> {
  const command = process.argv.slice(2);

  if (command.length === 0) {
    console.error('usage: e2e-local-lifecycle.ts <command> [args...]');
    process.exit(2);
  }

  try {
    process.exit(
      process.env.CI
        ? await runCommand({ command, env: process.env })
        : await runLocally({ command }),
    );
  } catch (error) {
    console.error(`✖ local E2E: ${describeError({ error })}`);
    process.exit(1);
  }
}

await main();
