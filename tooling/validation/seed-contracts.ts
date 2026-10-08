import { buildTestLayerSteps } from './affected';
import {
  formatStepTable,
  hasFailure,
  type LaneStep,
  runStages,
} from './run-lanes';
import { SEED_CONTRACT_TARGETS } from './seed-impact';

const LAYERS = ['test:unit', 'test:integration'] as const;

/**
 * The aggregate seed-contract path (#331): every contract in
 * `SEED_CONTRACT_TARGETS`, and nothing else, through the same turbo steps
 * `validate:affected` builds. `validate:affected` selects the same targets
 * whenever a seed-relevant change narrows a workspace to changed test files.
 */
export function buildSeedContractSteps(): LaneStep[] {
  return LAYERS.flatMap((testLayer) =>
    buildTestLayerSteps({
      testLayer,
      testTargets: SEED_CONTRACT_TARGETS,
      workspaceNames: [],
    }),
  );
}

if (import.meta.main) {
  const steps = buildSeedContractSteps();
  const results = await runStages({
    finalSteps: [],
    lanes: [
      steps.filter(({ label }) => label === 'test:unit'),
      steps.filter(({ label }) => label === 'test:integration'),
    ],
  });
  console.log('');
  console.log(formatStepTable({ results }));
  if (hasFailure({ results })) process.exitCode = 1;
}
