import {
  formatStepTable,
  hasFailure,
  type LaneStep,
  runStages,
} from './run-lanes';
import { formatLockWait, holdValidateLock } from './validate-lock';

/**
 * Unit tests are CPU-bound and integration tests are DB/IO-bound, so the two
 * lanes overlap instead of queueing; E2E needs everything else green first.
 */
export const LINT_TYPECHECK_UNIT_LANE: LaneStep[] = [
  { args: ['run', 'lint'], command: 'bun', label: 'lint' },
  { args: ['run', 'typecheck'], command: 'bun', label: 'typecheck' },
  { args: ['run', 'test:unit'], command: 'bun', label: 'test:unit' },
];

export const INTEGRATION_LANE: LaneStep[] = [
  {
    args: ['run', 'test:integration'],
    command: 'bun',
    label: 'test:integration',
  },
];

export const E2E_STEPS: LaneStep[] = [
  { args: ['run', 'test:e2e'], command: 'bun', label: 'test:e2e' },
];

if (import.meta.main) {
  // CI runs on its own runner, so only local runs queue for the slot.
  const lock = process.env.CI
    ? { release: () => {}, waitedMs: 0 }
    : await holdValidateLock({ tier: 'validate' });
  let results: Awaited<ReturnType<typeof runStages>>;
  try {
    results = await runStages({
      finalSteps: E2E_STEPS,
      lanes: [LINT_TYPECHECK_UNIT_LANE, INTEGRATION_LANE],
    });
  } finally {
    lock.release();
  }
  console.log('');
  console.log(formatStepTable({ results }));
  console.log(formatLockWait({ waitedMs: lock.waitedMs }));
  if (hasFailure({ results })) process.exitCode = 1;
}
