import { constants } from 'node:os';
// Dependency-free, like everything worktree bootstrap loads before install.
import { now } from '../../packages/time/src/now';
import {
  EXECUTION_PURPOSES,
  type ExecutionPurpose,
} from '../env/run-with-purpose';
import { errorMessage, tryRecordFailureBundle } from './failure-bundle';

/**
 * `bun tooling/diagnostics/run-managed.ts <name> -- <command...>`: runs a
 * managed command with its output streamed as usual, and when it fails
 * leaves one diagnostic bundle (ADR-0005) and prints its path. It keeps the
 * command's exit status; a success leaves nothing behind.
 *
 * A managed command running inside another (a `worktree:bootstrap` step
 * running `env:local`) only passes through, so the outermost one, which
 * knows the failed step, records the single bundle.
 */

const OWNER_VARIABLE = 'CHURCH_FAILURE_BUNDLE_OWNER';
// POSIX shells report a command that cannot be found with 127.
const NOT_STARTED_STATUS = 127;

export interface RunManagedInput {
  /** The managed command, e.g. `env:local`. */
  command: string;
  /** The step within it, when the caller runs steps. */
  step: string | null;
  argv: string[];
  cwd: string;
}

interface ProcessResult {
  exitStatus: number;
  signal: NodeJS.Signals | null;
  output: string;
}

interface SpawnInput {
  argv: string[];
  cwd: string;
  owner: string;
}

interface PumpInput {
  stream: ReadableStream<Uint8Array>;
  sink: NodeJS.WriteStream;
  chunks: string[];
}

/** Forwards a child stream to ours as it arrives, keeping a copy. */
async function pump(input: PumpInput): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of input.stream) {
    input.sink.write(chunk);
    input.chunks.push(decoder.decode(chunk, { stream: true }));
  }
}

/** Runs `argv`, streaming its output to ours while keeping a copy. */
async function runCapturing(input: SpawnInput): Promise<ProcessResult> {
  const chunks: string[] = [];
  let child: Bun.Subprocess<'inherit', 'pipe', 'pipe'>;

  try {
    child = Bun.spawn(input.argv, {
      cwd: input.cwd,
      env: { ...process.env, [OWNER_VARIABLE]: input.owner },
      stdin: 'inherit',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (error) {
    const message = errorMessage({ error });
    console.error(message);
    return {
      exitStatus: NOT_STARTED_STATUS,
      signal: null,
      output: `${message}\n`,
    };
  }

  await Promise.all([
    pump({ stream: child.stdout, sink: process.stdout, chunks }),
    pump({ stream: child.stderr, sink: process.stderr, chunks }),
    child.exited,
  ]);

  const signal = child.signalCode;
  return {
    exitStatus:
      child.exitCode ?? 128 + (signal ? constants.signals[signal] : 0),
    signal,
    output: chunks.join(''),
  };
}

function purposeFromEnvironment(): ExecutionPurpose | null {
  const purpose = process.env.CHURCH_EXEC_PURPOSE;
  return EXECUTION_PURPOSES.find((known) => known === purpose) ?? null;
}

/** Runs one managed command or step; returns its exit status. */
export async function runManaged(input: RunManagedInput): Promise<number> {
  if (process.env[OWNER_VARIABLE]) {
    return (
      await runCapturing({
        argv: input.argv,
        cwd: input.cwd,
        owner: process.env[OWNER_VARIABLE],
      })
    ).exitStatus;
  }

  const startedAt = now();
  const result = await runCapturing({
    argv: input.argv,
    cwd: input.cwd,
    owner: input.command,
  });

  if (result.exitStatus !== 0) {
    tryRecordFailureBundle({
      cwd: input.cwd,
      record: {
        command: input.command,
        step: input.step,
        commandLine: input.argv,
        purpose: purposeFromEnvironment(),
        startedAt,
        finishedAt: now(),
        exitStatus: result.exitStatus,
        signal: result.signal,
        output: result.output,
      },
    });
  }

  return result.exitStatus;
}

async function main(): Promise<void> {
  const [command, separator, ...argv] = process.argv.slice(2);

  if (!command || separator !== '--' || argv.length === 0) {
    console.error(
      'Usage: bun tooling/diagnostics/run-managed.ts <name> -- <command...>',
    );
    process.exit(2);
  }

  process.exit(
    await runManaged({ command, step: null, argv, cwd: process.cwd() }),
  );
}

if (import.meta.main) {
  await main();
}
