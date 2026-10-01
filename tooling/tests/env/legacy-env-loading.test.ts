import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

/**
 * #263 (ADR-0005): Varlock is the only value-file loader. No managed command
 * loads a value file by working directory (`--env-file`, `dotenv`, Bun's
 * automatic `.env` loading, Vite's `loadEnv`), and no legacy database alias
 * survives.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const WORKSPACES = [
  'apps/server',
  'apps/web',
  'packages/auth',
  'packages/db',
  'packages/env',
];
// Workspaces whose scripts run Bun from their own directory.
const BUN_WORKSPACES = [
  'apps/server',
  'apps/web',
  'packages/auth',
  'packages/db',
];

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ReadPackageJsonInput {
  workspace: string;
}

function readPackageJson(input: ReadPackageJsonInput): PackageJson {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, input.workspace, 'package.json'), 'utf8'),
  ) as PackageJson;
}

interface TurboTask {
  passThroughEnv?: string[];
}

interface TurboConfig {
  tasks: Record<string, TurboTask>;
}

interface ScriptInput {
  workspace: string;
  script: string;
}

function script(input: ScriptInput): string {
  const value = readPackageJson(input).scripts?.[input.script];
  if (!value) throw new Error(`${input.workspace} has no ${input.script}`);
  return value;
}

interface TrackedFilesInput {
  pattern: string;
}

/** Tracked files containing the pattern, outside planning history. */
function trackedFilesContaining(input: TrackedFilesInput): string[] {
  try {
    return execFileSync(
      'git',
      [
        'grep',
        '-lE',
        input.pattern,
        '--',
        '.',
        ':!planning',
        ':!manual-planning',
        ':!specs',
        ':!docs/research',
        ':!tooling/tests/env/legacy-env-loading.test.ts',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
      .trim()
      .split('\n');
  } catch {
    return [];
  }
}

// Development commands that read the environment run through Varlock with an
// explicit purpose, from their own package directory.
const DEVELOPMENT_COMMANDS: ScriptInput[] = [
  { workspace: 'apps/server', script: 'dev' },
  { workspace: 'apps/server', script: 'export:openapi' },
  { workspace: 'apps/server', script: 'seed:dev-users' },
  { workspace: 'apps/server', script: 'db:init-system' },
  { workspace: 'packages/db', script: 'db:push' },
  { workspace: 'packages/db', script: 'db:studio' },
  { workspace: 'packages/db', script: 'db:migrate' },
  { workspace: 'packages/db', script: 'db:seed' },
  { workspace: 'packages/db', script: 'db:seed:reset' },
  { workspace: 'packages/db', script: 'db:seed:dashboard-demo' },
  { workspace: 'packages/db', script: 'db:clean' },
];

describe('legacy environment loading', () => {
  it('no workspace script loads a value file with --env-file', () => {
    const offenders = ['.', ...WORKSPACES].flatMap((workspace) =>
      Object.entries(readPackageJson({ workspace }).scripts ?? {})
        .filter(([, command]) => /(^|\s)--env-file[=\s]/.test(command))
        .map(([name]) => `${workspace}:${name}`),
    );

    expect(offenders).toEqual([]);
  });

  it.each(
    DEVELOPMENT_COMMANDS.map((command) => [
      `${command.workspace}:${command.script}`,
      command,
    ]),
  )('%s runs through Varlock with the development purpose', (_label, command) => {
    expect(script(command as ScriptInput)).toStartWith(
      'CHURCH_EXEC_PURPOSE=development varlock run --path . -- ',
    );
  });

  // Web values are purpose-independent: `dev` keeps the purpose it inherits
  // (Playwright reuses it under e2e); a build bakes VITE_SERVER_URL in.
  it.each([
    'dev',
    'build',
    'start',
    'serve',
  ])('apps/web:%s runs through Varlock', (name) => {
    expect(script({ workspace: 'apps/web', script: name })).toStartWith(
      'varlock run --path . -- ',
    );
  });

  // A deployment injects the URL through the process environment.
  it('Turbo passes VITE_SERVER_URL through to the web build', () => {
    const turbo = JSON.parse(
      readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8'),
    ) as TurboConfig;

    expect(turbo.tasks.build?.passThroughEnv).toContain('VITE_SERVER_URL');
  });

  it.each(
    BUN_WORKSPACES,
  )('%s disables Bun automatic value-file loading', (workspace) => {
    const bunfig = join(REPO_ROOT, workspace, 'bunfig.toml');

    expect(existsSync(bunfig)).toBe(true);
    expect(readFileSync(bunfig, 'utf8')).toMatch(/^env = false$/m);
  });

  it('no source loads dotenv or depends on it', () => {
    expect(
      trackedFilesContaining({ pattern: `from 'dotenv|'dotenv/config'` }),
    ).toEqual([]);
    const dependents = ['.', ...WORKSPACES].filter((workspace) => {
      const pkg = readPackageJson({ workspace });
      return 'dotenv' in { ...pkg.dependencies, ...pkg.devDependencies };
    });
    expect(dependents).toEqual([]);
  });

  it('Vite never loads value files by working directory', () => {
    const viteConfig = readFileSync(
      join(REPO_ROOT, 'apps/web/vite.config.ts'),
      'utf8',
    );

    expect(viteConfig).not.toContain('loadEnv');
    expect(viteConfig).not.toContain("envDir: '../../'");
  });

  it('no legacy test database alias remains', () => {
    expect(
      trackedFilesContaining({
        pattern: 'TEST_DATABASE_URL|DATABASE_URL_TEST',
      }),
    ).toEqual([]);
  });
});
