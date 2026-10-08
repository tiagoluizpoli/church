import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { buildSeedContractSteps } from '../../validation/seed-contracts';
import { SEED_CONTRACT_TARGETS } from '../../validation/seed-impact';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const WORKSPACE_PATHS: Record<string, string> = {
  '@church/db': 'packages/db',
  server: 'apps/server',
};

describe('seed contract targets', () => {
  it.each(
    SEED_CONTRACT_TARGETS.map((target) => [
      `${target.workspaceName}:${target.testPath}`,
      target,
    ]),
  )('%s names a test that exists', (_name, target) => {
    const workspacePath = WORKSPACE_PATHS[target.workspaceName];

    expect(workspacePath).toBeDefined();
    expect(
      existsSync(join(REPO_ROOT, workspacePath ?? '', target.testPath)),
    ).toBe(true);
  });
});

describe('buildSeedContractSteps', () => {
  it('runs only the contracts of each workspace, never its whole layer', () => {
    const steps = buildSeedContractSteps();

    const integration = steps.filter(
      ({ label }) => label === 'test:integration',
    );
    expect(integration.map(({ args }) => args.join(' '))).toEqual([
      expect.stringContaining('--filter server --only -- tests/seeds/'),
      expect.stringContaining(
        '--filter @church/db --only -- tests/destructive-development-commands.test.ts',
      ),
    ]);
    expect(
      steps
        .filter(({ label }) => label === 'test:unit')
        .map(({ args }) => args),
    ).toEqual([expect.arrayContaining(['--filter', 'server', 'tests/seeds/'])]);
  });
});
