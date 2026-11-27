import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { ValidationPlan } from '../../validation/affected-plan';

/**
 * The real CLI's dry run over a temporary Git history, so base and head
 * `turbo.json` come from actual `git` plumbing.
 */

const SCRIPT_PATH = resolve(import.meta.dir, '../../validation/affected.ts');

const EVERY_WORKSPACE = [
  '@church/auth',
  '@church/config',
  '@church/core',
  '@church/db',
  '@church/env',
  '@church/server',
  '@church/time',
  '@church/web',
];

interface TurboFixture {
  globalEnv: string[];
  tasks: Record<string, object>;
}

const BASE_TURBO: TurboFixture = {
  globalEnv: ['TZ'],
  tasks: {
    build: { outputs: ['dist/**'] },
    '@church/web#build': { cache: false },
    '@church/server#build': { cache: false },
  },
};

let repoDir: string;

function git(args: string[]): void {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: repoDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${result.stderr.toString()}`,
    );
  }
}

function writeTurbo(content: string): void {
  writeFileSync(join(repoDir, 'turbo.json'), content);
}

interface ChangedTasksInput {
  tasks: TurboFixture['tasks'];
}

function withTasks({ tasks }: ChangedTasksInput): string {
  return JSON.stringify({
    ...BASE_TURBO,
    tasks: { ...BASE_TURBO.tasks, ...tasks },
  });
}

interface DryRunResult {
  explanation: string;
  plan: ValidationPlan;
}

function dryRun(): DryRunResult {
  git(['commit', '--quiet', '-am', 'chore: change turbo.json']);
  const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run'], {
    cwd: repoDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const explanation = result.stderr.toString();
  if (result.exitCode !== 0) throw new Error(explanation);
  return { explanation, plan: JSON.parse(result.stdout.toString()) };
}

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'affected-turbo-test-'));
  git(['init', '--quiet', '-b', 'develop']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  writeTurbo(JSON.stringify(BASE_TURBO));
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'chore: baseline']);
  git(['checkout', '--quiet', '-b', 'feature/x']);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('a turbo.json change that reaches beyond one package', () => {
  it.each([
    ['a global key', JSON.stringify({ ...BASE_TURBO, globalEnv: ['CI'] })],
    [
      'a generic task entry',
      withTasks({ tasks: { build: { outputs: ['out/**'] } } }),
    ],
    [
      'two packages',
      withTasks({
        tasks: {
          '@church/web#build': { cache: true },
          '@church/server#build': { cache: true },
        },
      }),
    ],
    [
      'a package task and a generic task',
      withTasks({
        tasks: { '@church/web#build': { cache: true }, build: { cache: true } },
      }),
    ],
    [
      'a package the plan does not know',
      withTasks({ tasks: { '@church/i18n#build': { cache: false } } }),
    ],
    ['an unparsable file', '{ "tasks": {'],
    ['formatting only', JSON.stringify(BASE_TURBO, null, 2)],
  ])('selects every workspace for %s', (_name, head) => {
    writeTurbo(head);

    const { explanation, plan } = dryRun();

    expect(plan.workspaceNames).toEqual(EVERY_WORKSPACE);
    expect(plan.testLayers).toEqual(['test:unit', 'test:integration']);
    expect(plan.toolingTestPaths).toEqual(['turbo.json']);
    expect(explanation).toContain(
      '  - @church/web\n      root-infrastructure <- turbo.json\n',
    );
    expect(explanation).not.toContain('narrowed');
  });

  it('selects every workspace when the base has no turbo.json', () => {
    git(['checkout', '--quiet', 'develop']);
    git(['rm', '--quiet', 'turbo.json']);
    git(['commit', '--quiet', '-m', 'chore: no turbo.json']);
    git(['checkout', '--quiet', '-B', 'feature/x']);
    writeTurbo(withTasks({ tasks: { '@church/web#build': { cache: true } } }));
    git(['add', '-A']);
    git(['commit', '--quiet', '-m', 'chore: add turbo.json']);
    writeTurbo(withTasks({ tasks: { '@church/web#build': { cache: false } } }));

    expect(dryRun().plan.workspaceNames).toEqual(EVERY_WORKSPACE);
  });
});

describe('a turbo.json change confined to one package', () => {
  it('selects only that package and says why', () => {
    writeTurbo(
      withTasks({
        tasks: {
          '@church/web#build': { cache: true },
          '@church/web#test:unit': { cache: false },
        },
      }),
    );

    const { explanation, plan } = dryRun();

    expect(plan.workspaceNames).toEqual(['@church/web']);
    expect(plan.workspaceSelectionReasons).toEqual([
      {
        changedPath: 'turbo.json',
        detail: 'turbo-package-task',
        workspaceName: '@church/web',
      },
    ]);
    expect(plan.testLayers).toEqual(['test:unit']);
    expect(plan.toolingTestPaths).toEqual(['turbo.json']);
    expect(explanation).toContain(
      '  - @church/web\n      turbo-package-task <- turbo.json\n',
    );
    expect(explanation).toContain('  - @church/web: whole suite (');
    expect(explanation).toContain(
      'turbo.json narrowed to @church/web: only its own task entries differ (@church/web#build, @church/web#test:unit)',
    );
  });

  it('narrows a removed package task entry, without the package dependents', () => {
    const { '@church/server#build': _removed, ...tasks } = BASE_TURBO.tasks;
    writeTurbo(JSON.stringify({ ...BASE_TURBO, tasks }));

    const { plan } = dryRun();

    expect(plan.workspaceNames).toEqual(['@church/server']);
    expect(plan.testLayers).toEqual(['test:unit', 'test:integration']);
  });

  it('still selects every workspace beside another root infrastructure change', () => {
    writeTurbo(withTasks({ tasks: { '@church/web#build': { cache: true } } }));
    writeFileSync(join(repoDir, 'bun.lock'), '{}\n');
    git(['add', 'bun.lock']);

    expect(dryRun().plan.workspaceNames).toEqual(EVERY_WORKSPACE);
  });
});

describe('a turbo.json change confined to a package with no test layer', () => {
  it.each([
    '@church/config',
    '@church/env',
    '@church/time',
  ])('selects every workspace for %s and says why', (workspaceName) => {
    writeTurbo(
      withTasks({
        tasks: { [`${workspaceName}#build`]: { cache: false } },
      }),
    );

    const { explanation, plan } = dryRun();

    expect(plan.workspaceNames).toEqual(EVERY_WORKSPACE);
    expect(plan.testLayers).toEqual(['test:unit', 'test:integration']);
    expect(explanation).toContain(
      `turbo.json not narrowed: ${workspaceName} has no test layer in the plan, so every workspace is selected (${workspaceName}#build)`,
    );
  });
});
