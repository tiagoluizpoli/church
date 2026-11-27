import {
  type ExecFileSyncOptionsWithStringEncoding,
  execFileSync,
} from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  classifyChanges,
  isScriptsOnlyAddition,
  type TestLayer,
  type TestTarget,
  type ValidationPlan,
  WORKSPACES,
} from './affected-plan';
import { readE2eImportGraph } from './e2e-import-graph';
import {
  findReusablePass,
  formatReusedPass,
  readCleanTree,
  readJudgedTree,
  readMergeBase,
  recordPass,
} from './gate-pass';
import {
  type CheckTiming,
  countTests,
  type FormatGateEndingInput,
  formatGateEnding,
  formatGateSummary,
} from './gate-summary';
import {
  hasFailure,
  type LaneStep,
  type OutputSink,
  PROCESS_OUTPUT,
  runStages,
  type StepResult,
} from './run-lanes';
import {
  readSeedAcknowledgements,
  type SeedAcknowledgements,
} from './seed-acknowledgements';
import { readSeedImpactTrailers, SEED_IMPACT_TRAILER } from './seed-impact';
import { BUNDLE_BUDGET_STEP, VALIDATE_SETUP_STEPS } from './validate';
import { formatLockWait, holdValidateLock } from './validate-lock';

export { classifyChanges, isScriptsOnlyAddition } from './affected-plan';
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
  /** Root package.json only gained scripts versus the merge base. */
  packageJsonScriptsOnlyAddition: boolean;
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
  tier: ValidationTier;
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

/** `no-docker` drops integration and E2E, the steps that need Docker. */
export type ValidationTier = 'affected' | 'no-docker';

export interface RunValidationInput {
  onlyE2e: boolean;
  plan: ValidationPlan;
  skipE2e: boolean;
  tier?: ValidationTier;
  /** Keep whole-workspace unit suites in `affected` (the CI Develop Gate). */
  wholeUnitSuites?: boolean;
}

interface RunValidationResult {
  failed: boolean;
  timings: CheckTiming[];
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
const UNIT_ONLY_LAYERS: TestLayer[] = ['test:unit'];

// The script may run from a temporary repo, so read manifests from this checkout.
const REPO_ROOT = join(import.meta.dir, '..', '..');
const UNIT_CONCURRENCY = '2';
// db + auth + server integration run together; each has its own cloned database and capped workers.
const INTEGRATION_CONCURRENCY = '3';

/** Where the import graph can trace a changed file to the tests that use it. */
const TRACEABLE_PATH = /^(?:apps|packages)\/[^/]+\/(?:src|tests|seeds)\//;
const UNTRACEABLE_PATH = /\/tests\/setup\/|\/fixtures\//;

/** Workspace paths whose package.json has a `test:unit:related` script. */
const RELATED_UNIT_WORKSPACE_PATHS = new Map(
  WORKSPACES.filter(({ path }) =>
    readFileSync(join(REPO_ROOT, path, 'package.json'), 'utf8').includes(
      '"test:unit:related"',
    ),
  ).map(({ name, path }) => [name, path]),
);

/** Per-branch git config naming the branch a ticket merges into. */
const VALIDATE_BASE_CONFIG = 'validateBase';

/**
 * A clean worktree with committed branch changes must not report nothing to
 * check — a working-tree-only diff sees no uncommitted changes and silently
 * skips them. With no explicit `--base`, use the branch's configured
 * integration branch (`git config branch.<branch>.validateBase <ref>`), so a
 * ticket that merged its spec branch diffs only its own commits; otherwise
 * fall back to `develop`. The diff uses the merge base (not the tip), so
 * changes landing on the target after the branch forked don't inflate the
 * local plan.
 */
function resolveDefaultBaseRef(): string | undefined {
  const configured = readConfiguredBaseRef();
  if (configured !== undefined) {
    // A silent develop fallback would bring back the whole-spec diff.
    if (!isRef({ ref: configured })) {
      throw new Error(
        `git config ${VALIDATE_BASE_CONFIG} names "${configured}", which does not resolve; fix it or pass --base.`,
      );
    }
    return configured;
  }
  return ['develop', 'origin/develop'].find((ref) => isRef({ ref }));
}

const QUIET_GIT: ExecFileSyncOptionsWithStringEncoding = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
};

function readConfiguredBaseRef(): string | undefined {
  try {
    const branch = execFileSync(
      'git',
      ['symbolic-ref', '--short', 'HEAD'],
      QUIET_GIT,
    ).trim();
    const key = `branch.${branch}.${VALIDATE_BASE_CONFIG}`;
    return execFileSync('git', ['config', '--get', key], QUIET_GIT).trim();
  } catch {
    return undefined; // detached HEAD or no setting
  }
}

function isRef({ ref }: { ref: string }): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], QUIET_GIT);
    return true;
  } catch {
    return false;
  }
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

  let packageJsonScriptsOnlyAddition = false;
  if (resolvedBaseRef && changedPaths.includes('package.json')) {
    try {
      const mergeBase = execFileSync(
        'git',
        ['merge-base', resolvedBaseRef, 'HEAD'],
        { encoding: 'utf8' },
      ).trim();
      packageJsonScriptsOnlyAddition = isScriptsOnlyAddition({
        base: execFileSync('git', ['show', `${mergeBase}:package.json`], {
          encoding: 'utf8',
        }),
        head: readFileSync('package.json', 'utf8'),
      });
    } catch {} // base unavailable: keep treating it as root infrastructure
  }

  return {
    baseRef: resolvedBaseRef,
    changedPaths,
    packageJsonScriptsOnlyAddition,
    deletedPaths: changedPaths.filter((path) => !existsSync(path)),
  };
}

export interface IsWholeLocalRunInput {
  argumentsResult: ParseArgumentsResult;
  ci?: string;
}

/** Only a whole local run of its tier may reuse or record a gate pass; a narrowed or CI run stands for nothing. */
export function isWholeLocalRun({
  argumentsResult,
  ci,
}: IsWholeLocalRunInput): boolean {
  const { baseRef, dailyGate, dryRun, e2eSpecPaths, onlyE2e, skipE2e } =
    argumentsResult;
  return (
    !ci &&
    !dryRun &&
    !onlyE2e &&
    !skipE2e &&
    !dailyGate &&
    !baseRef &&
    e2eSpecPaths.length === 0
  );
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
  let tier: ValidationTier = 'affected';

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

    if (arg === '--no-docker') {
      tier = 'no-docker';
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
    tier,
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
  /** Lint, guards and typecheck: run first, and a failure stops the gate. */
  checkLane: LaneStep[];
  checkedLabels: string[];
  e2eLabel: string;
  e2eSteps: LaneStep[];
  integrationLane: LaneStep[];
  unitLane: LaneStep[];
}

/**
 * Lint, guards and typecheck run first, so a cheap failure never pays for
 * the test lanes. Then unit tests and integration tests run in two lanes so
 * the CPU-bound and DB-bound work overlap, and E2E runs last. Only the
 * scheduling differs from running each layer in turn — the commands are
 * unchanged.
 */
export function buildValidationSteps({
  onlyE2e,
  plan,
  skipE2e: skipE2eArgument,
  tier = 'affected',
  wholeUnitSuites = false,
}: RunValidationInput): ValidationSteps {
  const noDocker = tier === 'no-docker';
  const skipE2e = skipE2eArgument || noDocker;
  const checkedLabels: string[] = [];
  const checkLane: LaneStep[] = [];
  const unitLane: LaneStep[] = [];
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
    checkLane.push({
      args: ['run', 'validate:test-placement'],
      command: 'bun',
      label: 'test-placement',
    });
    checkLane.push({
      args: ['run', 'validate:i18n-parity'],
      command: 'bun',
      label: 'i18n-parity',
    });
    checkLane.push({
      args: ['run', 'validate:named-parameters'],
      command: 'bun',
      label: 'named-parameters',
    });
    checkLane.push({
      args: ['run', 'validate:journey-map'],
      command: 'bun',
      label: 'journey-map',
    });
    checkLane.push({
      args: ['run', 'validate:presentation-text'],
      command: 'bun',
      label: 'presentation-text',
    });
    checkLane.push({
      args: ['run', 'validate:date-time-seam'],
      command: 'bun',
      label: 'date-time-seam',
    });

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
    if (plan.workspaceNames.includes('web')) {
      checkLane.push(BUNDLE_BUDGET_STEP);
    }

    const tierLayers = noDocker ? UNIT_ONLY_LAYERS : ALL_TEST_LAYERS;
    for (const testLayer of tierLayers) {
      if (!plan.testLayers.includes(testLayer)) continue;
      const layerSteps =
        testLayer === 'test:unit' && !wholeUnitSuites
          ? buildRelatedUnitSteps({ plan })
          : buildTestLayerSteps({
              testLayer,
              testTargets: plan.testTargets,
              workspaceNames: plan.workspaceNames,
            });
      if (testLayer === 'test:integration') integrationLane.push(...layerSteps);
      else unitLane.push(...layerSteps);
    }
    checkedLabels.push(
      'lint',
      'test-placement',
      'i18n-parity',
      'named-parameters',
      'journey-map',
      'presentation-text',
      'date-time-seam',
      'typecheck',
      'bundle-budget',
      ...ALL_TEST_LAYERS,
    );
    if (plan.toolingTestPaths.length > 0) {
      unitLane.push({
        args: ['test', 'tooling'],
        command: 'bun',
        label: 'test:tooling',
      });
      checkedLabels.push('test:tooling');
    }
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

  return {
    checkLane,
    checkedLabels,
    e2eLabel,
    e2eSteps,
    integrationLane,
    unitLane,
  };
}

interface RunValidationStepsInput {
  cwd?: string;
  output?: OutputSink;
  steps: ValidationSteps;
}

export function runValidationSteps({
  cwd,
  output,
  steps,
}: RunValidationStepsInput): Promise<StepResult[]> {
  return runStages({
    cwd,
    finalSteps: steps.e2eSteps,
    firstSteps: steps.checkLane,
    lanes: [steps.unitLane, steps.integrationLane],
    output,
  });
}

async function runValidation({
  onlyE2e,
  plan,
  skipE2e,
  output,
  tier,
  wholeUnitSuites,
}: RunValidationInput & {
  output: OutputSink;
}): Promise<RunValidationResult> {
  const timings: CheckTiming[] = [];
  const steps = buildValidationSteps({
    onlyE2e,
    plan,
    skipE2e,
    tier,
    wholeUnitSuites,
  });
  const { checkedLabels, e2eLabel } = steps;

  // The i18n compile runs before every check: lint, typecheck and tests read
  // the compiled messages, and a stale compile fails them falsely.
  const results = await runValidationSteps({
    output,
    steps: {
      ...steps,
      checkLane: [...VALIDATE_SETUP_STEPS, ...steps.checkLane],
    },
  });

  const setupLabels = VALIDATE_SETUP_STEPS.map(({ label }) => label);
  for (const label of [...setupLabels, ...checkedLabels]) {
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
  const concurrency =
    testLayer === 'test:integration'
      ? INTEGRATION_CONCURRENCY
      : UNIT_CONCURRENCY;
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

interface UnitSelection {
  changedPaths: string[];
  /** Why the whole suite runs; undefined when only related tests run. */
  wholeSuiteReason: string | undefined;
  workspaceName: string;
}

/**
 * Per workspace: run only the tests whose imports reach the changed files
 * that selected it, unless the change can't be traced by the import graph —
 * root infrastructure, a deletion, anything outside `src/`, `tests/` or
 * `seeds/` (config, env, package.json, tsconfig), test setup or fixtures.
 */
function selectUnitTests({ plan }: { plan: ValidationPlan }): UnitSelection[] {
  const deletedPaths = new Set(plan.deletedPaths);
  return plan.workspaceNames.map((workspaceName) => {
    const reasons = plan.workspaceSelectionReasons.filter(
      (reason) => reason.workspaceName === workspaceName,
    );
    const changedPaths = [
      ...new Set(reasons.map(({ changedPath }) => changedPath)),
    ];
    let wholeSuiteReason: string | undefined;
    if (!RELATED_UNIT_WORKSPACE_PATHS.has(workspaceName)) {
      wholeSuiteReason = 'no related-test support';
    } else if (reasons.some(({ detail }) => detail === 'root-infrastructure')) {
      wholeSuiteReason = `root infrastructure: ${
        reasons.find(({ detail }) => detail === 'root-infrastructure')
          ?.changedPath
      }`;
    } else {
      const untraceable = changedPaths.find(
        (changedPath) =>
          deletedPaths.has(changedPath) ||
          !TRACEABLE_PATH.test(changedPath) ||
          UNTRACEABLE_PATH.test(changedPath),
      );
      if (untraceable !== undefined) {
        wholeSuiteReason = `${
          deletedPaths.has(untraceable) ? 'deleted file' : 'untraceable change'
        }: ${untraceable}`;
      }
    }
    return { changedPaths, wholeSuiteReason, workspaceName };
  });
}

/** Unit steps for the tiers that narrow by import graph. */
function buildRelatedUnitSteps({ plan }: { plan: ValidationPlan }): LaneStep[] {
  const wholeSuiteWorkspaceNames: string[] = [];
  const relatedSteps: LaneStep[] = [];

  for (const {
    changedPaths,
    wholeSuiteReason,
    workspaceName,
  } of selectUnitTests({ plan })) {
    const workspacePath = RELATED_UNIT_WORKSPACE_PATHS.get(workspaceName);
    if (wholeSuiteReason !== undefined || workspacePath === undefined) {
      wholeSuiteWorkspaceNames.push(workspaceName);
      continue;
    }
    relatedSteps.push({
      ...buildTurboStep({
        args: changedPaths.map((changedPath) =>
          relative(workspacePath, changedPath),
        ),
        concurrency: UNIT_CONCURRENCY,
        task: 'test:unit:related',
        workspaceNames: [workspaceName],
      }),
      label: 'test:unit',
    });
  }

  if (wholeSuiteWorkspaceNames.length === 0) return relatedSteps;
  return [
    buildTurboStep({
      args: [],
      concurrency: UNIT_CONCURRENCY,
      task: 'test:unit',
      workspaceNames: wholeSuiteWorkspaceNames,
    }),
    ...relatedSteps,
  ];
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
  seedAcknowledgements?: SeedAcknowledgements;
  tier?: ValidationTier;
  wholeUnitSuites?: boolean;
}

export function explainPlan({
  baseRef,
  plan,
  seedAcknowledgements,
  tier = 'affected',
  wholeUnitSuites = false,
}: ExplainPlanInput): string {
  const notRun = tier === 'no-docker' ? ' (not run by validate:no-docker)' : '';
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
    lines.push(
      `  - ${testLayer}${testLayer === 'test:integration' ? notRun : ''}`,
    );
    for (const reason of plan.testLayerSelectionReasons.filter(
      (r) => r.testLayer === testLayer,
    )) {
      lines.push(
        `      ${reason.detail} <- ${reason.changedPath} (${reason.workspaceName})`,
      );
    }
  }

  if (plan.testLayers.includes('test:unit')) {
    lines.push('', 'Unit test selection:');
    for (const { wholeSuiteReason, workspaceName } of selectUnitTests({
      plan,
    })) {
      const mode = wholeUnitSuites
        ? 'whole suite (CI keeps whole-workspace selection)'
        : wholeSuiteReason === undefined
          ? 'related tests'
          : `whole suite (${wholeSuiteReason})`;
      lines.push(`  - ${workspaceName}: ${mode}`);
    }
  }

  lines.push('', `Browser journeys selected${notRun}:`);
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

  lines.push('', 'Tooling tests selected:');
  if (plan.toolingTestPaths.length === 0) {
    lines.push('  (none)');
  } else {
    for (const path of plan.toolingTestPaths) lines.push(`  - ${path}`);
  }

  lines.push('', ...explainSeedImpact({ plan, seedAcknowledgements }));

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
  seedAcknowledgements?: SeedAcknowledgements;
}

function explainSeedImpact({
  plan,
  seedAcknowledgements,
}: ExplainSeedImpactInput): string[] {
  const {
    accepted = [],
    borrowed = [],
    ownBaseRef,
  } = seedAcknowledgements ?? {};
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
  // A reason with no commit came from --no-seed-impact.
  for (const reason of new Set(acknowledgements)) {
    const shas = accepted
      .filter((acknowledgement) => acknowledgement.reason === reason)
      .map(({ sha }) => sha);
    const source = shas.length > 0 ? ` (commit ${shas.join(', ')})` : '';
    lines.push(`  acknowledged: ${reason}${source}`);
  }
  if (accepted.length > 0 || borrowed.length > 0) {
    lines.push(`  own commits: above ${ownBaseRef}`);
  }
  if (decision === 'undecided') {
    for (const { reason, sha } of borrowed) {
      lines.push(
        `  refused: ${reason} (commit ${sha}) is not one of this branch's own commits (above ${ownBaseRef}).`,
      );
    }
    if (borrowed.length > 0) lines.push('  Add the trailer on this branch.');
    lines.push(
      '  Update apps/server/seeds (and its contracts) in this change, or',
      `  acknowledge it with a commit trailer "${SEED_IMPACT_TRAILER}"`,
      '  (or --no-seed-impact "<reason>" for uncommitted work).',
    );
  }
  return lines;
}

interface RunCliInput {
  argumentsResult: ParseArgumentsResult;
  /** Filled as the run learns it; the exit handler prints it. */
  ending: Omit<FormatGateEndingInput, 'exitCode'>;
}

async function runCli({ argumentsResult, ending }: RunCliInput) {
  const { tier } = argumentsResult;
  if (tier === 'no-docker') {
    console.log(
      'validate:no-docker skips integration tests and browser journeys; CI runs them.',
    );
  }
  const {
    baseRef,
    changedPaths,
    deletedPaths,
    packageJsonScriptsOnlyAddition,
  } = collectChangedPaths({ baseRef: argumentsResult.baseRef });
  const seedAcknowledgements = readSeedAcknowledgements({ baseRef });
  const plan = classifyChanges({
    changedPaths,
    dailyGate: argumentsResult.dailyGate,
    deletedPaths,
    e2eImportGraph: readE2eImportGraph(),
    e2eSpecPaths: argumentsResult.e2eSpecPaths,
    packageJsonScriptsOnlyAddition,
    seedImpactAcknowledgements: [
      ...argumentsResult.seedImpactAcknowledgements,
      ...seedAcknowledgements.accepted.map(({ reason }) => reason),
    ],
  });

  ending.journeyFallbacks = plan.missingJourneyMappings;
  ending.seedDecision = plan.seedImpact.decision;

  console.log(JSON.stringify(plan, null, 2));
  if (plan.missingJourneyMappings.length > 0) {
    console.warn(
      `No journey mapping for: ${plan.missingJourneyMappings.join(', ')}. Running the critical smoke set as a conservative fallback — add a tooling/validation/journey-map.ts entry to select the specific journey instead.`,
    );
  }

  // Only a run that would validate refuses: --dry-run stays a pure plan whose
  // JSON other CI steps parse, and the gate that runs validation enforces it.
  if (plan.seedImpact.decision === 'undecided' && !argumentsResult.dryRun) {
    console.error(explainPlan({ baseRef, plan, seedAcknowledgements }));
    console.error(
      '\nSeed impact is undecided: this change touches schema, persistence, authentication, tenancy or scheduling. Nothing was validated.',
    );
    process.exit(1);
  }

  if (argumentsResult.dryRun) {
    // CI redirects --dry-run's stdout to a file and parses it as JSON with
    // Bun (see ci.yml's "Determine affected plan" step) — the explanation
    // must stay off stdout so that stays valid JSON.
    console.error('');
    console.error(explainPlan({ baseRef, plan, seedAcknowledgements }));
  } else {
    const mergeBase =
      baseRef && isWholeLocalRun({ argumentsResult, ci: process.env.CI })
        ? readMergeBase({ baseRef })
        : null;
    const reusablePass = mergeBase
      ? findReusablePass({ base: mergeBase, tier })
      : null;
    if (reusablePass) {
      console.log(formatReusedPass({ pass: reusablePass }));
      process.exit(0);
    }
    const tree = mergeBase ? readCleanTree({}) : null;
    const lock = await holdValidateLock({ tier });
    const { counts, output } = countTests({ output: PROCESS_OUTPUT });
    ending.counts = counts;
    let failed: boolean;
    let timings: CheckTiming[];
    try {
      ({ failed, timings } = await runValidation({
        output,
        onlyE2e: argumentsResult.onlyE2e,
        plan,
        skipE2e: argumentsResult.skipE2e,
        tier,
        wholeUnitSuites: argumentsResult.dailyGate,
      }));
    } finally {
      lock.release();
    }
    ending.timings = timings;
    const explanation = explainPlan({
      baseRef,
      plan,
      seedAcknowledgements,
      tier,
      wholeUnitSuites: argumentsResult.dailyGate,
    });
    console.log('');
    console.log(formatLockWait({ waitedMs: lock.waitedMs }));
    console.log('');
    console.log(explanation);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const summary = formatGateSummary(ending);
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\n### Gate summary\n\n${summary}\n\n### Selection reasons\n\n\`\`\`\n${explanation}\n\`\`\`\n`,
      );
    }
    if (failed) process.exitCode = 1;
    else if (tree && mergeBase) recordPass({ base: mergeBase, tier, tree });
  }
}

if (import.meta.main) {
  const argumentsResult = parseArguments({ args: Bun.argv.slice(2) });
  const ending: RunCliInput['ending'] = { tree: 'unknown' };
  // A dry run's stdout is parsed as JSON. Every other run ends with the
  // summary however it ends: pass, failure, throw, busy slot or signal.
  if (!argumentsResult.dryRun) {
    ending.tree = readJudgedTree({});
    process.on('exit', (exitCode) => {
      process.stdout.write(formatGateEnding({ ...ending, exitCode }));
    });
  }
  try {
    await runCli({ argumentsResult, ending });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
