import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Records whether the current Playwright run failed, so global teardown can
 * keep the E2E database state of a failed run for diagnosis instead of
 * cleaning it (#260). Playwright gives teardown no run result: it calls
 * teardown before a reporter's `onEnd`, and before `onBegin`/`onError` when
 * global setup throws. So global setup clears the marker when a run starts
 * and records its own failure; this reporter records a test that fails its
 * final attempt, an interrupted test, or an error outside the tests. The next
 * run's global setup resets the target anyway.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));

export const E2E_RUN_FAILURE_MARKER = path.resolve(
  dirname,
  '../.auth/e2e-run-failure.txt',
);

export type ReportedTest = Pick<TestCase, 'outcome' | 'retries' | 'titlePath'>;
export type ReportedTestResult = Pick<TestResult, 'status' | 'retry'>;
export type ReportedError = Pick<TestError, 'message'>;

export interface E2eRunFailureInput {
  /** Overrides the marker file; tests use a temporary one. */
  markerPath?: string;
}

export interface RecordE2eRunFailureInput extends E2eRunFailureInput {
  reason: string;
}

export interface DescribeE2eFailureInput {
  error: unknown;
}

function markerPathOf(input: E2eRunFailureInput): string {
  return input.markerPath ?? E2E_RUN_FAILURE_MARKER;
}

/** One line naming a failure, for the marker and teardown's warning. */
export function describeE2eFailure(input: DescribeE2eFailureInput): string {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  return message.split('\n')[0] ?? message;
}

/** The recorded reason the current run failed, if it has. */
export function readE2eRunFailure(
  input: E2eRunFailureInput = {},
): string | undefined {
  const markerPath = markerPathOf(input);
  return existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : undefined;
}

/** Records why the run failed; the first recorded reason is kept. */
export function recordE2eRunFailure(input: RecordE2eRunFailureInput): void {
  const markerPath = markerPathOf(input);

  if (existsSync(markerPath)) return;
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, input.reason);
}

/** Forgets the previous run's failure when a new run starts. */
export function clearE2eRunFailure(input: E2eRunFailureInput = {}): void {
  rmSync(markerPathOf(input), { force: true });
}

export default class E2eRunOutcomeReporter implements Reporter {
  private readonly markerPath: string;

  constructor(options: E2eRunFailureInput = {}) {
    this.markerPath = markerPathOf(options);
  }

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: ReportedTest, result: ReportedTestResult): void {
    const title = test.titlePath().filter(Boolean).slice(1).join(' › ');

    if (result.status === 'interrupted') {
      this.record(`${title} was interrupted`);
    } else if (
      result.retry >= test.retries &&
      test.outcome() === 'unexpected'
    ) {
      this.record(`${title} failed`);
    }
  }

  onError(error: ReportedError): void {
    this.record(
      describeE2eFailure({
        error: error.message ?? 'an error outside any test',
      }),
    );
  }

  private record(reason: string): void {
    recordE2eRunFailure({ markerPath: this.markerPath, reason });
  }
}
