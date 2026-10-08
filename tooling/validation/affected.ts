import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import {
  classifyChanges,
  type TestLayer,
  type TestTarget,
  type ValidationPlan,
} from './affected-plan';
import {
  hasFailure,
  type LaneStep,
  runStages,
  type StepResult,
} from './run-lanes';
import { readSeedImpactTrailers, SEED_IMPACT_TRAILER } from './seed-impact';

export { classifyChanges } from './affected-plan';
export { readSeedImpactTrailers };

interface CommandInput {
  args: string[];
  command: string;
}

interface CollectChangedPathsInput {
  baseRef?: string;
}

interface CollectChangedPathsResult {
  baseRef: string | undefined;
  changedPaths: string[];
  /** Changed paths with no file in the working tree. */
  deletedPaths: string[];
  /** Messages of the commits the branch adds over the base. */
  commitMessages: string[];
}

interface ParseArgumentsInput {
  args: string[];
}

interface ParseArgumentsResult {
  baseRef?: string;
  dailyGate: boolean;
  dryRun: boolean;
  e2eSpecPaths: string[];
  onlyE2e: boolean;
  seedImpactAcknowledgements: string[];
  skipE2e: boolean;
}

interface BuildTestLayerStepsInput {
  testLayer: TestLayer;
  testTargets: TestTarget[];
  workspaceNames: string[];
}

interface BuildTurboStepInput {
  args: string[];
  concurrency: string;
  task: string;
  workspaceNames: string[];
}

export interface RunValidationInput {
  onlyE2e: boolean;
  plan: ValidationPlan;
  skipE2e: boolean;
}

interface RunValidationResult {
  failed: boolean;
  timings: CheckTiming[];
}

export interface CheckTiming {
  failed?: boolean;
  label: string;
  ms: number;
  skipped?: boolean;
}

interface PushSkippedInput {
  label: string;
  timings: CheckTiming[];
}

interface PushLayerTimingInput {
  label: string;
  results: StepResult[];
  timings: CheckTiming[];
}

const ALL_TEST_LAYERS: TestLayer[] = ['test:unit', 'test:integration'];

/**
 * A clean worktree with committed branch changes must not report nothing to
 * check — a working-tree-only diff sees no uncommitted changes and silently
 * skips them. With no explicit `--base`, fall back to the task branch's
 * likely target so committed work is still included, using its merge base
 * (not its tip) so unrelated changes landing on the target after the branch
 * forked don't inflate the local plan.
 */
function resolveDefaultBaseRef(): string | undefined {
  for (const candidate of ['develop', 'origin/develop']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', candidate], {
        stdio: 'ignore',
      });
      return candidate;
    } catch {}
  }
  return undefined;
}

function collectChangedPaths({
  baseRef,
}: CollectChangedPathsInput): CollectChangedPathsResult {
  const resolvedBaseRef = baseRef ?? resolveDefaultBaseRef();

  // CI checks out a merge commit with a clean tree, so the working-tree
  // diffs below are always empty there; --base there is always explicit
  // (the PR's target branch). Locally, `...` diffs against the merge base so
  // committed branch work is included alongside the uncommitted diffs below.
  const baseComparisonPaths = resolvedBaseRef
    ? runCommand({
        args: ['diff', '--name-only', `${resolvedBaseRef}...HEAD`],
        command: 'git',
      })
    : [];

  const changedPaths = [
    ...baseComparisonPaths,
    ...runCommand({ args: ['diff', '--name-only'], command: 'git' }),
    ...runCommand({
      args: ['diff', '--cached', '--name-only'],
      command: 'git',
    }),
    ...runCommand({
      args: ['ls-files', '--others', '--exclude-standard'],
      command: 'git',
    }),
  ].filter(
    (path, index, paths) => path.length > 0 && paths.indexOf(path) === index,
  );

  const commitMessages = resolvedBaseRef
    ? runCommand({
        args: ['log', '--format=%B%x00', `${resolvedBaseRef}..HEAD`],
        command: 'git',
      })
        .join('\n')
        .split('\0')
    : [];

  return {
    baseRef: resolvedBaseRef,
    changedPaths,
    commitMessages,
    deletedPaths: changedPaths.filter((path) => !existsSync(path)),
  };
}

export function parseArguments({
  args,
}: ParseArgumentsInput): ParseArgumentsResult {
  const e2eSpecPaths: string[] = [];
  const seedImpactAcknowledgements: string[] = [];
  let dryRun = false;
  let dailyGate = false;
  let baseRef: string | undefined;
  let skipE2e = false;
  let onlyE2e = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--daily-gate') {
      dailyGate = true;
      continue;
    }

    if (arg === '--skip-e2e') {
      skipE2e = true;
      continue;
    }

    if (arg === '--only-e2e') {
      onlyE2e = true;
      continue;
    }

    if (arg === '--base') {
      const baseRefValue = args[index + 1];
      if (!baseRefValue) throw new Error('--base requires a ref.');
      baseRef = baseRefValue;
      index += 1;
      continue;
    }

    if (arg === '--no-seed-impact') {
      const reason = args[index + 1];
      if (!reason) throw new Error('--no-seed-impact requires a reason.');
      seedImpactAcknowledgements.push(reason);
      index += 1;
      continue;
    }

    if (arg === '--e2e') {
      const e2eSpecPath = args[index + 1];
      if (!e2eSpecPath) throw new Error('--e2e requires a spec path.');
      e2eSpecPaths.push(e2eSpecPath);
      index += 1;
    }
  }

  if (skipE2e && onlyE2e) {
    throw new Error('--skip-e2e and --only-e2e are mutually exclusive.');
  }

  return {
    baseRef,
    dailyGate,
    dryRun,
    e2eSpecPaths,
    onlyE2e,
    seedImpactAcknowledgements,
    skipE2e,
  };
}

function runCommand({ args, command }: CommandInput): string[] {
  const output = execFileSync(command, args, { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function pushSkipped({ label, timings }: PushSkippedInput): void {
  timings.push({ label, ms: 0, skipped: true });
}

/**
 * A layer can be several consecutive steps (remaining workspaces plus one per
 * targeted workspace); the summary keeps one row per layer, summing them.
 */
function pushLayerTiming({
  label,
  results,
  timings,
}: PushLayerTimingInput): void {
  const ms = results.reduce((total, result) => total + result.ms, 0);
  if (hasFailure({ results })) {
    timings.push({ failed: true, label, ms });
  } else if (results.every((result) => result.status === 'skipped')) {
    pushSkipped({ label, timings });
  } else {
    timings.push({ label, ms });
  }
}

export interface ValidationSteps {
  checkLane: LaneStep[];
  checkedLabels: string[];
  e2eLabel: string;
  e2eSteps: LaneStep[];
  integrationLane: LaneStep[];
}

/**
 * Lint, typecheck and unit tests share one lane; integration tests run in
 * the other so the CPU-bound and DB-bound work overlap. Only the scheduling
 * differs from running each layer in turn — the commands are unchanged.
 */
export function buildValidationSteps({
  onlyE2e,
  plan,
  skipE2e,
}: RunValidationInput): ValidationSteps {
  const checkedLabels: string[] = [];
  const checkLane: LaneStep[] = [];
  const integrationLane: LaneStep[] = [];

  if (!onlyE2e) {
    // A deleted file is still a changed path — it must keep its package in
    // scope for typecheck and tests — but Biome cannot read it, and reports
    // each one as an internal error. Drop them at the lint step only.
    const lintPaths = plan.lintPaths.filter((lintPath) => existsSync(lintPath));
    if (lintPaths.length > 0) {
      checkLane.push({
        args: ['run', 'lint:files', '--', ...lintPaths],
        command: 'bun',
        label: 'lint',
      });
    }

    if (plan.workspaceNames.length > 0) {
      const filters = plan.workspaceNames.flatMap((workspaceName) => [
        '--filter',
        workspaceName,
      ]);
      checkLane.push({
        args: ['turbo', 'typecheck', '--concurrency=2', ...filters],
        command: 'bunx',
        label: 'typecheck',
      });
    }

    for (const testLayer of ALL_TEST_LAYERS) {
      if (!plan.testLayers.includes(testLayer)) continue;
      const layerSteps = buildTestLayerSteps({
        testLayer,
        testTargets: plan.testTargets,
        workspaceNames: plan.workspaceNames,
      });
      if (testLayer === 'test:integration') integrationLane.push(...layerSteps);
      else checkLane.push(...layerSteps);
    }
    checkedLabels.push('lint', 'typecheck', ...ALL_TEST_LAYERS);
  }

  let e2eLabel = 'test:e2e';
  const e2eSteps: LaneStep[] = [];
  if (!skipE2e && plan.requiresFullE2e) {
    e2eLabel = 'test:e2e (full suite)';
    e2eSteps.push({
      args: ['run', 'test:e2e'],
      command: 'bun',
      label: 'test:e2e',
    });
  } else if (!skipE2e && plan.e2eSpecPaths.length > 0) {
    e2eLabel = 'test:e2e (affected journeys)';
    e2eSteps.push({
      args: ['run', 'test:e2e', '--', ...plan.e2eSpecPaths],
      command: 'bun',
      label: 'test:e2e',
    });
  }

  return { checkLane, checkedLabels, e2eLabel, e2eSteps, integrationLane };
}

async function runValidation({
  onlyE2e,
  plan,
  skipE2e,
}: RunValidationInput): Promise<RunValidationResult> {
  const timings: CheckTiming[] = [];
  const { checkLane, checkedLabels, e2eLabel, e2eSteps, integrationLane } =
    buildValidationSteps({ onlyE2e, plan, skipE2e });

  const results = await runStages({
    finalSteps: e2eSteps,
    lanes: [checkLane, integrationLane],
  });

  for (const label of checkedLabels) {
    const layerResults = results.filter((result) => result.label === label);
    if (layerResults.length === 0) pushSkipped({ label, timings });
    else pushLayerTiming({ label, results: layerResults, timings });
  }

  const e2eResults = results.filter((result) => result.label === 'test:e2e');
  if (e2eResults.length === 0) {
    pushSkipped({ label: 'test:e2e', timings });
  } else {
    pushLayerTiming({ label: e2eLabel, results: e2eResults, timings });
  }

  return { failed: hasFailure({ results }), timings };
}

export function buildTestLayerSteps({
  testLayer,
  testTargets,
  workspaceNames,
}: BuildTestLayerStepsInput): LaneStep[] {
  const targetsForLayer = testTargets.filter(
    (testTarget) => testTarget.testLayer === testLayer,
  );
  const targetedWorkspaceNames = new Set(
    targetsForLayer.map((testTarget) => testTarget.workspaceName),
  );
  const remainingWorkspaceNames = workspaceNames.filter(
    (workspaceName) => !targetedWorkspaceNames.has(workspaceName),
  );
  const concurrency = testLayer === 'test:integration' ? '1' : '2';
  const steps: LaneStep[] = [];

  if (remainingWorkspaceNames.length > 0) {
    steps.push(
      buildTurboStep({
        args: [],
        concurrency,
        task: testLayer,
        workspaceNames: remainingWorkspaceNames,
      }),
    );
  }

  for (const workspaceName of targetedWorkspaceNames) {
    const testPaths = targetsForLayer
      .filter((testTarget) => testTarget.workspaceName === workspaceName)
      .map((testTarget) => testTarget.testPath);
    steps.push(
      buildTurboStep({
        args: testPaths,
        concurrency,
        task: testLayer,
        workspaceNames: [workspaceName],
      }),
    );
  }

  return steps;
}

function buildTurboStep({
  args,
  concurrency,
  task,
  workspaceNames,
}: BuildTurboStepInput): LaneStep {
  const filters = workspaceNames.flatMap((workspaceName) => [
    '--filter',
    workspaceName,
  ]);
  // --only: turbo.json's `dependsOn: ["^task"]` would otherwise fan this task
  // out into every upstream dependency (@church/core, @church/db, ...) even
  // when workspaceNames + testTargets already account for the full affected
  // closure (classifyChanges walks DEPENDENTS itself). Without --only, that
  // fan-out runs the task in packages that don't have `args`' file paths and
  // crashes with "No test files found".
  return {
    args: [
      'turbo',
      task,
      `--concurrency=${concurrency}`,
      ...filters,
      '--only',
      '--',
      ...args,
    ],
    command: 'bunx',
    label: task,
  };
}

interface ExplainPlanInput {
  baseRef: string | undefined;
  plan: ValidationPlan;
}

export function explainPlan({ baseRef, plan }: ExplainPlanInput): string {
  const lines: string[] = [
    `Base ref: ${baseRef ?? '(none — working tree only)'}`,
    '',
    'Workspaces selected:',
  ];

  for (const workspaceName of plan.workspaceNames) {
    lines.push(`  - ${workspaceName}`);
    for (const reason of plan.workspaceSelectionReasons.filter(
      (r) => r.workspaceName === workspaceName,
    )) {
      lines.push(`      ${reason.detail} <- ${reason.changedPath}`);
    }
  }

  lines.push('', 'Test layers selected:');
  if (plan.testLayers.length === 0) lines.push('  (none)');
  for (const testLayer of plan.testLayers) {
    lines.push(`  - ${testLayer}`);
    for (const reason of plan.testLayerSelectionReasons.filter(
      (r) => r.testLayer === testLayer,
    )) {
      lines.push(
        `      ${reason.detail} <- ${reason.changedPath} (${reason.workspaceName})`,
      );
    }
  }

  lines.push('', 'Browser journeys selected:');
  for (const specPath of plan.e2eSpecPaths) {
    lines.push(`  - ${specPath}`);
    for (const reason of plan.journeySelectionReasons.filter(
      (r) => r.specPath === specPath,
    )) {
      lines.push(
        `      ${reason.detail}${reason.changedPath ? ` <- ${reason.changedPath}` : ''}`,
      );
    }
  }

  lines.push('', ...explainSeedImpact({ plan }));

  if (plan.missingJourneyMappings.length > 0) {
    lines.push(
      '',
      'Missing journey mappings (fell back to critical smoke set):',
    );
    for (const path of plan.missingJourneyMappings) lines.push(`  - ${path}`);
  }

  return lines.join('\n');
}

interface ExplainSeedImpactInput {
  plan: ValidationPlan;
}

function explainSeedImpact({ plan }: ExplainSeedImpactInput): string[] {
  const { acknowledgements, changes, decision } = plan.seedImpact;
  if (decision === 'not-applicable') return ['Seed impact: none selected'];

  const lines = [
    decision === 'undecided'
      ? 'Seed impact: decision required (seed contracts selected)'
      : `Seed impact: ${decision} (seed contracts selected)`,
  ];
  for (const { area, changedPath } of changes) {
    lines.push(`  - ${area} <- ${changedPath}`);
  }
  for (const reason of acknowledgements) {
    lines.push(`  acknowledged: ${reason}`);
  }
  if (decision === 'undecided') {
    lines.push(
      '  Update apps/server/seeds (and its contracts) in this change, or',
      `  acknowledge it with a commit trailer "${SEED_IMPACT_TRAILER}"`,
      '  (or --no-seed-impact "<reason>" for uncommitted work).',
    );
  }
  return lines;
}

interface FormatTimingSummaryInput {
  timings: CheckTiming[];
}

export function formatTimingSummary({
  timings,
}: FormatTimingSummaryInput): string {
  const lines = ['| Check | Elapsed |', '| --- | --- |'];
  for (const { failed, label, ms, skipped } of timings) {
    const elapsed = `${(ms / 1000).toFixed(1)}s`;
    const status = skipped
      ? 'skipped'
      : failed
        ? `failed (${elapsed})`
        : elapsed;
    lines.push(`| ${label} | ${status} |`);
  }
  return lines.join('\n');
}

if (import.meta.main) {
  const argumentsResult = parseArguments({ args: Bun.argv.slice(2) });
  const { baseRef, changedPaths, commitMessages, deletedPaths } =
    collectChangedPaths({ baseRef: argumentsResult.baseRef });
  const plan = classifyChanges({
    changedPaths,
    dailyGate: argumentsResult.dailyGate,
    deletedPaths,
    e2eSpecPaths: argumentsResult.e2eSpecPaths,
    seedImpactAcknowledgements: [
      ...argumentsResult.seedImpactAcknowledgements,
      ...readSeedImpactTrailers({ messages: commitMessages }),
    ],
  });

  console.log(JSON.stringify(plan, null, 2));
  if (plan.missingJourneyMappings.length > 0) {
    console.warn(
      `No journey mapping for: ${plan.missingJourneyMappings.join(', ')}. Running the critical smoke set as a conservative fallback — add a tooling/validation/journey-map.ts entry to select the specific journey instead.`,
    );
  }

  // Only a run that would validate refuses: --dry-run stays a pure plan whose
  // JSON other CI steps parse, and the gate that runs validation enforces it.
  if (plan.seedImpact.decision === 'undecided' && !argumentsResult.dryRun) {
    console.error(explainPlan({ baseRef, plan }));
    console.error(
      '\nSeed impact is undecided: this change touches schema, persistence, authentication, tenancy or scheduling. Nothing was validated.',
    );
    process.exit(1);
  }

  if (argumentsResult.dryRun) {
    // CI redirects --dry-run's stdout to a file and parses it as JSON with
    // jq (see ci.yml's "Determine affected plan" step) — the explanation
    // must stay off stdout so that stays valid JSON.
    console.error('');
    console.error(explainPlan({ baseRef, plan }));
  } else {
    const { failed, timings } = await runValidation({
      onlyE2e: argumentsResult.onlyE2e,
      plan,
      skipE2e: argumentsResult.skipE2e,
    });
    const summary = formatTimingSummary({ timings });
    const explanation = explainPlan({ baseRef, plan });
    console.log('');
    console.log(summary);
    console.log('');
    console.log(explanation);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\n### Check timings\n\n${summary}\n\n### Selection reasons\n\n\`\`\`\n${explanation}\n\`\`\`\n`,
      );
    }
    if (failed) process.exitCode = 1;
  }
}
