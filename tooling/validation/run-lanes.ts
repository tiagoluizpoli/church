import { join } from 'node:path';
import type { Subprocess } from 'bun';

export interface LaneStep {
  args: string[];
  command: string;
  label: string;
}

export type StepStatus = 'failed' | 'passed' | 'skipped';

export interface StepResult {
  label: string;
  ms: number;
  status: StepStatus;
}

export interface WriteTextInput {
  text: string;
}

export interface OutputSink {
  stderr: (input: WriteTextInput) => void;
  stdout: (input: WriteTextInput) => void;
}

interface RunLanesInput {
  cwd?: string;
  lanes: LaneStep[][];
  output?: OutputSink;
}

interface RunStagesInput extends RunLanesInput {
  /** Steps that run in order only after every lane step has passed. */
  finalSteps: LaneStep[];
}

interface RunStepInput {
  cwd: string;
  output: OutputSink;
  step: LaneStep;
}

interface PumpStreamInput {
  label: string;
  /** Resolves when the reader should be cancelled and the tail flushed. */
  stop: Promise<void>;
  stream: ReadableStream<Uint8Array>;
  write: (input: WriteTextInput) => void;
}

interface FormatStepTableInput {
  results: StepResult[];
}

interface HasFailureInput {
  results: StepResult[];
}

const REPO_ROOT = join(import.meta.dir, '..', '..');

const PROCESS_OUTPUT: OutputSink = {
  stderr: ({ text }) => {
    process.stderr.write(text);
  },
  stdout: ({ text }) => {
    process.stdout.write(text);
  },
};

/**
 * A grandchild (turbo daemon, Playwright webServer) can inherit the pipes and
 * keep them open long after the step's own process exited; wait this long for
 * the tail of the output, then stop reading.
 */
const DRAIN_GRACE_MS = 2000;

const liveChildren = new Set<Subprocess>();
let interruptedBy: NodeJS.Signals | undefined;
let signalsInstalled = false;

const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

/**
 * On SIGINT/SIGTERM, wait for every live child, then exit with the
 * conventional 128+signal code. No further steps start once interrupted.
 * SIGTERM is forwarded; SIGINT is not, because Ctrl-C already reaches the
 * whole process group, and a second SIGINT makes the E2E lifecycle skip its
 * cleanup.
 */
function installSignalForwarding(): void {
  if (signalsInstalled) return;
  signalsInstalled = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      // A repeated signal means a child is stuck: stop waiting for it.
      if (interruptedBy) process.exit(SIGNAL_EXIT_CODES[signal]);
      interruptedBy = signal;
      const children = [...liveChildren];
      if (signal === 'SIGTERM') {
        for (const child of children) child.kill(signal);
      }
      Promise.all(children.map((child) => child.exited)).then(() =>
        process.exit(SIGNAL_EXIT_CODES[signal]),
      );
    });
  }
}

/**
 * Prefix every line with its step label so interleaved lane output stays
 * attributable. Partial lines are buffered until their newline arrives, and
 * flushed when the stream ends or is stopped, so a prefix never lands
 * mid-line.
 */
async function pumpStream({
  label,
  stop,
  stream,
  write,
}: PumpStreamInput): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let pending = '';
  stop.then(() => reader.cancel().catch(() => undefined));

  for (;;) {
    const { done, value } = await reader.read().catch(() => ({
      done: true,
      value: undefined,
    }));
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) write({ text: `[${label}] ${line}\n` });
  }

  pending += decoder.decode();
  if (pending.length > 0) write({ text: `[${label}] ${pending}\n` });
}

async function runStep({
  cwd,
  output,
  step,
}: RunStepInput): Promise<StepResult> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  let child: Subprocess<'inherit', 'pipe', 'pipe'> | undefined;

  try {
    child = Bun.spawn([step.command, ...step.args], {
      cwd,
      stderr: 'pipe',
      stdin: 'inherit',
      stdout: 'pipe',
    });
    liveChildren.add(child);
    const stop = child.exited.then(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, DRAIN_GRACE_MS).unref();
        }),
    );
    const [exitCode] = await Promise.all([
      child.exited,
      pumpStream({
        label: step.label,
        stop,
        stream: child.stdout,
        write: output.stdout,
      }),
      pumpStream({
        label: step.label,
        stop,
        stream: child.stderr,
        write: output.stderr,
      }),
    ]);
    return {
      label: step.label,
      ms: elapsed(),
      status: exitCode === 0 ? 'passed' : 'failed',
    };
  } catch (error) {
    child?.kill();
    output.stderr({
      text: `[${step.label}] ${error instanceof Error ? error.message : String(error)}\n`,
    });
    return { label: step.label, ms: elapsed(), status: 'failed' };
  } finally {
    if (child) liveChildren.delete(child);
  }
}

/**
 * Lanes run concurrently; steps inside a lane run in order and stop at the
 * first failure (the rest are `skipped`). A failing lane never kills another
 * lane, so one run reports everything that is broken. Results are returned in
 * lane order, then step order.
 */
export async function runLanes({
  cwd = REPO_ROOT,
  lanes,
  output = PROCESS_OUTPUT,
}: RunLanesInput): Promise<StepResult[]> {
  installSignalForwarding();
  const laneResults = await Promise.all(
    lanes.map(async (lane) => {
      const results: StepResult[] = [];
      let failed = false;
      for (const step of lane) {
        if (failed || interruptedBy) {
          results.push({ label: step.label, ms: 0, status: 'skipped' });
          continue;
        }
        const result = await runStep({ cwd, output, step });
        results.push(result);
        failed = result.status === 'failed';
      }
      return results;
    }),
  );
  return laneResults.flat();
}

export function hasFailure({ results }: HasFailureInput): boolean {
  return results.some((result) => result.status === 'failed');
}

/**
 * Run the lanes, then the final steps (e.g. E2E, which is expensive and
 * needs the cheaper checks green first) only if nothing failed.
 */
export async function runStages({
  finalSteps,
  ...lanesInput
}: RunStagesInput): Promise<StepResult[]> {
  const laneResults = await runLanes(lanesInput);
  if (hasFailure({ results: laneResults })) {
    return [
      ...laneResults,
      ...finalSteps.map(
        (step): StepResult => ({ label: step.label, ms: 0, status: 'skipped' }),
      ),
    ];
  }
  const finalResults = await runLanes({ ...lanesInput, lanes: [finalSteps] });
  return [...laneResults, ...finalResults];
}

export function formatStepTable({ results }: FormatStepTableInput): string {
  const lines = ['| Step | Status | Elapsed |', '| --- | --- | --- |'];
  for (const { label, ms, status } of results) {
    lines.push(
      `| ${label} | ${status} | ${status === 'skipped' ? '-' : `${(ms / 1000).toFixed(1)}s`} |`,
    );
  }
  return lines.join('\n');
}
