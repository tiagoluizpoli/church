import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import {
  classifyChanges,
  type TestLayer,
  type TestTarget,
  type ValidationPlan,
} from './affected-plan';

export { classifyChanges } from './affected-plan';

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
  skipE2e: boolean;
}

interface RunTestLayerInput {
  testLayer: TestLayer;
  testTargets: TestTarget[];
  workspaceNames: string[];
}

interface RunTurboTaskInput {
  args: string[];
  concurrency: string;
  task: string;
  workspaceNames: string[];
}

interface RunValidationInput {
  onlyE2e: boolean;
  plan: ValidationPlan;
  skipE2e: boolean;
}

interface RunValidationResult {
  timings: CheckTiming[];
}

export interface CheckTiming {
  label: string;
  ms: number;
  skipped?: boolean;
}

interface TimeCheckInput<T> {
  label: string;
  run: () => T;
  timings: CheckTiming[];
}

interface PushSkippedInput {
  label: string;
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

  return { baseRef: resolvedBaseRef, changedPaths };
}

export function parseArguments({
  args,
}: ParseArgumentsInput): ParseArgumentsResult {
  const e2eSpecPaths: string[] = [];
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

  return { baseRef, dailyGate, dryRun, e2eSpecPaths, onlyE2e, skipE2e };
}

function runCommand({ args, command }: CommandInput): string[] {
  const output = execFileSync(command, args, { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function timeCheck<T>({ label, run, timings }: TimeCheckInput<T>): T {
  const startedAt = performance.now();
  const result = run();
  timings.push({ label, ms: Math.round(performance.now() - startedAt) });
  return result;
}

function pushSkipped({ label, timings }: PushSkippedInput): void {
  timings.push({ label, ms: 0, skipped: true });
}

function runValidation({
  onlyE2e,
  plan,
  skipE2e,
}: RunValidationInput): RunValidationResult {
  const timings: CheckTiming[] = [];

  if (!onlyE2e) {
    // A deleted file is still a changed path — it must keep its package in
    // scope for typecheck and tests — but Biome cannot read it, and reports
    // each one as an internal error. Drop them at the lint step only.
    const lintPaths = plan.lintPaths.filter((lintPath) => existsSync(lintPath));
    if (lintPaths.length > 0) {
      timeCheck({
        label: 'lint',
        run: () =>
          execFileSync('bun', ['run', 'lint:files', '--', ...lintPaths], {
            stdio: 'inherit',
          }),
        timings,
      });
    } else {
      pushSkipped({ label: 'lint', timings });
    }

    if (plan.workspaceNames.length > 0) {
      const filters = plan.workspaceNames.flatMap((workspaceName) => [
        '--filter',
        workspaceName,
      ]);
      timeCheck({
        label: 'typecheck',
        run: () =>
          execFileSync(
            'bunx',
            ['turbo', 'typecheck', '--concurrency=2', ...filters],
            { stdio: 'inherit' },
          ),
        timings,
      });
    } else {
      pushSkipped({ label: 'typecheck', timings });
    }

    for (const testLayer of ALL_TEST_LAYERS) {
      if (plan.testLayers.includes(testLayer)) {
        timeCheck({
          label: testLayer,
          run: () =>
            runTestLayer({
              testLayer,
              testTargets: plan.testTargets,
              workspaceNames: plan.workspaceNames,
            }),
          timings,
        });
      } else {
        pushSkipped({ label: testLayer, timings });
      }
    }
  }

  if (skipE2e) {
    pushSkipped({ label: 'test:e2e', timings });
    return { timings };
  }

  if (plan.requiresFullE2e) {
    timeCheck({
      label: 'test:e2e (full suite)',
      run: () => execFileSync('bun', ['run', 'test:e2e'], { stdio: 'inherit' }),
      timings,
    });
    return { timings };
  }

  if (plan.e2eSpecPaths.length > 0) {
    timeCheck({
      label: 'test:e2e (affected journeys)',
      run: () =>
        execFileSync('bun', ['run', 'test:e2e', '--', ...plan.e2eSpecPaths], {
          stdio: 'inherit',
        }),
      timings,
    });
  } else {
    pushSkipped({ label: 'test:e2e', timings });
  }

  return { timings };
}

function runTestLayer({
  testLayer,
  testTargets,
  workspaceNames,
}: RunTestLayerInput): void {
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

  if (remainingWorkspaceNames.length > 0) {
    runTurboTask({
      args: [],
      concurrency,
      task: testLayer,
      workspaceNames: remainingWorkspaceNames,
    });
  }

  for (const workspaceName of targetedWorkspaceNames) {
    const testPaths = targetsForLayer
      .filter((testTarget) => testTarget.workspaceName === workspaceName)
      .map((testTarget) => testTarget.testPath);
    runTurboTask({
      args: testPaths,
      concurrency,
      task: testLayer,
      workspaceNames: [workspaceName],
    });
  }
}

function runTurboTask({
  args,
  concurrency,
  task,
  workspaceNames,
}: RunTurboTaskInput): void {
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
  execFileSync(
    'bunx',
    [
      'turbo',
      task,
      `--concurrency=${concurrency}`,
      ...filters,
      '--only',
      '--',
      ...args,
    ],
    { stdio: 'inherit' },
  );
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

  if (plan.missingJourneyMappings.length > 0) {
    lines.push(
      '',
      'Missing journey mappings (fell back to critical smoke set):',
    );
    for (const path of plan.missingJourneyMappings) lines.push(`  - ${path}`);
  }

  return lines.join('\n');
}

interface FormatTimingSummaryInput {
  timings: CheckTiming[];
}

export function formatTimingSummary({
  timings,
}: FormatTimingSummaryInput): string {
  const lines = ['| Check | Elapsed |', '| --- | --- |'];
  for (const { label, ms, skipped } of timings) {
    lines.push(
      `| ${label} | ${skipped ? 'skipped' : `${(ms / 1000).toFixed(1)}s`} |`,
    );
  }
  return lines.join('\n');
}

if (import.meta.main) {
  const argumentsResult = parseArguments({ args: Bun.argv.slice(2) });
  const { baseRef, changedPaths } = collectChangedPaths({
    baseRef: argumentsResult.baseRef,
  });
  const plan = classifyChanges({
    changedPaths,
    dailyGate: argumentsResult.dailyGate,
    e2eSpecPaths: argumentsResult.e2eSpecPaths,
  });

  console.log(JSON.stringify(plan, null, 2));
  if (plan.missingJourneyMappings.length > 0) {
    console.warn(
      `No journey mapping for: ${plan.missingJourneyMappings.join(', ')}. Running the critical smoke set as a conservative fallback — add a tooling/validation/journey-map.ts entry to select the specific journey instead.`,
    );
  }

  if (argumentsResult.dryRun) {
    // CI redirects --dry-run's stdout to a file and parses it as JSON with
    // jq (see ci.yml's "Determine affected plan" step) — the explanation
    // must stay off stdout so that stays valid JSON.
    console.error('');
    console.error(explainPlan({ baseRef, plan }));
  } else {
    const { timings } = runValidation({
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
  }
}
