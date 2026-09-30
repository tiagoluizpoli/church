import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

/**
 * #262 / ADR-0005: integration and E2E failures leave the same diagnostic
 * bundle as lifecycle failures, wherever they run. CI keeps bundles in
 * runner-temporary storage and uploads them only after a failure, for seven
 * days.
 */

interface WorkflowStep {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string | number>;
}

interface WorkflowJob {
  steps: WorkflowStep[];
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

interface CompositeRuns {
  steps: WorkflowStep[];
}

interface CompositeAction {
  runs: CompositeRuns;
}

interface TurboTask {
  passThroughEnv?: string[];
}

interface TurboConfig {
  tasks: Record<string, TurboTask>;
}

interface PackageManifest {
  scripts: Record<string, string>;
}

const ROOT = resolve(import.meta.dir, '../../..');

interface PathInput {
  path: string;
}

function read(input: PathInput): string {
  return readFileSync(resolve(ROOT, input.path), 'utf8');
}

function scripts(input: PathInput): Record<string, string> {
  return (
    JSON.parse(read({ path: `${input.path}/package.json` })) as PackageManifest
  ).scripts;
}

const workflow = Bun.YAML.parse(
  read({ path: '.github/workflows/ci.yml' }),
) as Workflow;
const setupAction = Bun.YAML.parse(
  read({ path: '.github/actions/setup-church-ci/action.yml' }),
) as CompositeAction;
const turbo = JSON.parse(read({ path: 'turbo.json' })) as TurboConfig;

const BUNDLES_DIR = '$RUNNER_TEMP/church-failure-bundles';
const TEST_COMMAND = /validate|test:integration|test:e2e|turbo test:/;

const testJobs = Object.entries(workflow.jobs).filter(([, job]) =>
  job.steps.some((step) => TEST_COMMAND.test(step.run ?? '')),
);

describe('CI failure bundles', () => {
  it('the setup action points bundles at runner-temporary storage', () => {
    const exports = setupAction.runs.steps
      .map((step) => step.run ?? '')
      .filter((run) => run.includes('CHURCH_FAILURE_BUNDLES_DIR'));

    expect(exports).toEqual([
      expect.stringContaining(
        `echo "CHURCH_FAILURE_BUNDLES_DIR=${BUNDLES_DIR}" >> "$GITHUB_ENV"`,
      ),
    ]);
  });

  it('covers every job that runs integration or E2E tests', () => {
    expect(testJobs.map(([name]) => name).sort()).toEqual([
      'develop-browser',
      'develop-fast',
      'e2e',
      'fast-gate',
      'release-gate',
    ]);
  });

  for (const [name, job] of testJobs) {
    it(`${name} uploads its bundles only after a failure, kept for seven days`, () => {
      const uploads = job.steps.filter((step) =>
        step.uses?.startsWith('actions/upload-artifact@'),
      );

      expect(uploads).toHaveLength(1);
      const upload = uploads[0];
      expect(upload).toMatchObject({
        if: 'failure()',
        with: { 'retention-days': 7, 'if-no-files-found': 'ignore' },
      });
      expect(String(upload?.with?.path)).toMatch(
        /^\$\{\{ runner\.temp \}\}\/church-failure-bundles$/,
      );
      expect(String(upload?.with?.name)).toMatch(/\{\{ github\.job \}\}/);
    });
  }
});

describe('test command failure bundles', () => {
  it('turbo passes the bundle directory to integration and E2E tasks', () => {
    for (const task of ['test:integration', 'test:e2e', 'test:e2e:ui']) {
      expect(turbo.tasks[task]?.passThroughEnv).toContain(
        'CHURCH_FAILURE_BUNDLES_DIR',
      );
    }
  });

  it('every integration runner is a managed command', () => {
    for (const path of [
      'apps/server',
      'apps/web',
      'packages/auth',
      'packages/db',
    ]) {
      expect(scripts({ path })['test:integration']).toMatch(
        /^(CHURCH_EXEC_PURPOSE=integration )?bun \.\.\/\.\.\/tooling\/diagnostics\/run-managed\.ts test:integration --step \S+ -- /,
      );
    }
  });

  it('E2E runs record Playwright output as bundle artifacts', () => {
    for (const script of ['test:e2e', 'test:e2e:ui']) {
      expect(scripts({ path: 'apps/web' })[script]).toContain(
        'e2e-local-lifecycle.ts --artifacts test-results ',
      );
    }
  });
});
