import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import E2eRunOutcomeReporter, {
  clearE2eRunFailure,
  type ReportedTest,
  type ReportedTestResult,
  readE2eRunFailure,
  recordE2eRunFailure,
} from './e2e-run-outcome';

// #260: a failed local run keeps its E2E database state for diagnosis, so
// teardown must know whether the run failed. Global setup and the reporter
// record it; global teardown reads it before deciding to clean.

let dir: string;
let markerPath: string;

interface FakeTestInput {
  outcome: ReturnType<ReportedTest['outcome']>;
  retries?: number;
}

function fakeTest({ outcome, retries = 0 }: FakeTestInput): ReportedTest {
  return {
    outcome: () => outcome,
    retries,
    titlePath: () => ['', 'chromium', 'identity/redeem.spec.ts', 'redeems'],
  };
}

interface FakeResultInput {
  status: ReportedTestResult['status'];
  retry?: number;
}

function fakeResult({
  status,
  retry = 0,
}: FakeResultInput): ReportedTestResult {
  return { status, retry };
}

function startedReporter(): E2eRunOutcomeReporter {
  clearE2eRunFailure({ markerPath });
  return new E2eRunOutcomeReporter({ markerPath });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'church-e2e-outcome-'));
  markerPath = join(dir, '.auth/e2e-run-failure.txt');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('E2E run outcome', () => {
  it('records no failure when every test passes', () => {
    const reporter = startedReporter();

    reporter.onTestEnd(
      fakeTest({ outcome: 'expected' }),
      fakeResult({ status: 'passed' }),
    );

    expect(readE2eRunFailure({ markerPath })).toBeUndefined();
  });

  it('records a test that fails its final attempt, naming it', () => {
    const reporter = startedReporter();

    reporter.onTestEnd(
      fakeTest({ outcome: 'unexpected' }),
      fakeResult({ status: 'failed' }),
    );

    expect(readE2eRunFailure({ markerPath })).toContain(
      'identity/redeem.spec.ts › redeems',
    );
  });

  it('ignores a failed attempt that a retry recovers', () => {
    const reporter = startedReporter();

    reporter.onTestEnd(
      fakeTest({ outcome: 'unexpected', retries: 1 }),
      fakeResult({ status: 'failed', retry: 0 }),
    );
    reporter.onTestEnd(
      fakeTest({ outcome: 'flaky', retries: 1 }),
      fakeResult({ status: 'passed', retry: 1 }),
    );

    expect(readE2eRunFailure({ markerPath })).toBeUndefined();
  });

  it('records an interrupted test', () => {
    const reporter = startedReporter();

    reporter.onTestEnd(
      fakeTest({ outcome: 'skipped' }),
      fakeResult({ status: 'interrupted' }),
    );

    expect(readE2eRunFailure({ markerPath })).toContain('interrupted');
  });

  it('records an error raised outside any test', () => {
    const reporter = startedReporter();

    reporter.onError({ message: 'Error: worker process exited unexpectedly' });

    expect(readE2eRunFailure({ markerPath })).toContain(
      'worker process exited unexpectedly',
    );
  });

  it('keeps a failure global setup records, which teardown sees before the reporter hears of it', () => {
    recordE2eRunFailure({ markerPath, reason: 'global setup failed: boom' });

    new E2eRunOutcomeReporter({ markerPath }).onError({
      message: 'Error: boom',
    });

    expect(readE2eRunFailure({ markerPath })).toBe('global setup failed: boom');
  });

  it('forgets the previous run once the next run clears it', () => {
    startedReporter().onTestEnd(
      fakeTest({ outcome: 'unexpected' }),
      fakeResult({ status: 'failed' }),
    );

    clearE2eRunFailure({ markerPath });

    expect(readE2eRunFailure({ markerPath })).toBeUndefined();
  });
});
