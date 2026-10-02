import {
  formatStepTable,
  hasFailure,
  type LaneStep,
  runStages,
} from './run-lanes';

/**
 * Unit tests are CPU-bound and integration tests are DB/IO-bound, so the two
 * lanes overlap instead of queueing; E2E needs everything else green first.
 */
const LINT_TYPECHECK_UNIT_LANE: LaneStep[] = [
  { args: ['run', 'lint'], command: 'bun', label: 'lint' },
  { args: ['run', 'typecheck'], command: 'bun', label: 'typecheck' },
  { args: ['run', 'test:unit'], command: 'bun', label: 'test:unit' },
];

const INTEGRATION_LANE: LaneStep[] = [
  {
    args: ['run', 'test:integration'],
    command: 'bun',
    label: 'test:integration',
  },
];

const E2E_STEPS: LaneStep[] = [
  { args: ['run', 'test:e2e'], command: 'bun', label: 'test:e2e' },
];

if (import.meta.main) {
  const results = await runStages({
    finalSteps: E2E_STEPS,
    lanes: [LINT_TYPECHECK_UNIT_LANE, INTEGRATION_LANE],
  });
  console.log('');
  console.log(formatStepTable({ results }));
  if (hasFailure({ results })) process.exitCode = 1;
}
