import { execFileSync } from 'node:child_process';
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

interface ParseArgumentsInput {
  args: string[];
}

interface ParseArgumentsResult {
  dryRun: boolean;
  e2eSpecPaths: string[];
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
  plan: ValidationPlan;
}

function collectChangedPaths(): string[] {
  return [
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
}

function parseArguments({ args }: ParseArgumentsInput): ParseArgumentsResult {
  const e2eSpecPaths: string[] = [];
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--e2e') {
      const e2eSpecPath = args[index + 1];
      if (!e2eSpecPath) throw new Error('--e2e requires a spec path.');
      e2eSpecPaths.push(e2eSpecPath);
      index += 1;
    }
  }

  return { dryRun, e2eSpecPaths };
}

function runCommand({ args, command }: CommandInput): string[] {
  const output = execFileSync(command, args, { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function runValidation({ plan }: RunValidationInput): void {
  if (plan.lintPaths.length > 0) {
    execFileSync('bun', ['run', 'lint:files', '--', ...plan.lintPaths], {
      stdio: 'inherit',
    });
  }

  if (plan.workspaceNames.length > 0) {
    const filters = plan.workspaceNames.flatMap((workspaceName) => [
      '--filter',
      workspaceName,
    ]);
    execFileSync(
      'bunx',
      ['turbo', 'typecheck', '--concurrency=2', ...filters],
      {
        stdio: 'inherit',
      },
    );

    for (const testLayer of plan.testLayers) {
      runTestLayer({
        testLayer,
        testTargets: plan.testTargets,
        workspaceNames: plan.workspaceNames,
      });
    }
  }

  if (plan.requiresFullE2e) {
    execFileSync('bun', ['run', 'test:e2e'], { stdio: 'inherit' });
    return;
  }

  if (plan.e2eSpecPaths.length > 0) {
    execFileSync('bun', ['run', 'test:e2e', '--', ...plan.e2eSpecPaths], {
      stdio: 'inherit',
    });
  }
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
  execFileSync(
    'bunx',
    ['turbo', task, `--concurrency=${concurrency}`, ...filters, '--', ...args],
    { stdio: 'inherit' },
  );
}

if (import.meta.main) {
  const argumentsResult = parseArguments({ args: Bun.argv.slice(2) });
  const plan = classifyChanges({
    changedPaths: collectChangedPaths(),
    e2eSpecPaths: argumentsResult.e2eSpecPaths,
  });

  console.log(JSON.stringify(plan, null, 2));
  if (!argumentsResult.dryRun) runValidation({ plan });
}
