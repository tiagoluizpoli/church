import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { buildValidationSteps } from '../../validation/affected';
import { runLanes } from '../../validation/run-lanes';
import { makePlan } from './plan';

/**
 * Runs the planned `presentation-text` and `date-time-seam` lane steps for
 * real, inside a throwaway checkout holding a copy of the guards, so a clean
 * tree passes and a finding fails the lane (#859).
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const GUARD_LABELS = ['presentation-text', 'date-time-seam'];

let checkoutDir: string;

function writeSource({ path, source }: { path: string; source: string }) {
  const fullPath = join(checkoutDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, source);
}

async function runGuardLane() {
  const { checkLane } = buildValidationSteps({
    onlyE2e: false,
    plan: makePlan({}),
    skipE2e: false,
    tier: 'no-docker',
  });
  const lane = checkLane.filter(({ label }) => GUARD_LABELS.includes(label));
  return runLanes({
    cwd: checkoutDir,
    lanes: [lane],
    output: { stderr: () => {}, stdout: () => {} },
  });
}

beforeEach(() => {
  checkoutDir = mkdtempSync(join(tmpdir(), 'affected-guard-lanes-'));
  cpSync(
    join(REPO_ROOT, 'tooling/validation'),
    join(checkoutDir, 'tooling/validation'),
    { recursive: true },
  );
  symlinkSync(
    join(REPO_ROOT, 'node_modules'),
    join(checkoutDir, 'node_modules'),
  );
  writeFileSync(
    join(checkoutDir, 'package.json'),
    JSON.stringify({
      scripts: {
        'validate:date-time-seam':
          'bun tooling/validation/date-time-seam-guards.ts',
        'validate:presentation-text':
          'bun tooling/validation/presentation-text-guard.ts',
      },
    }),
  );
  Bun.spawnSync(['git', 'init', '--quiet'], { cwd: checkoutDir });
  writeSource({
    path: 'apps/web/src/ok.tsx',
    source: 'export const Ok = () => null;\n',
  });
});

afterEach(() => {
  rmSync(checkoutDir, { force: true, recursive: true });
});

describe('affected guard lane steps, executed', () => {
  it('passes both guards on a clean checkout', async () => {
    const results = await runGuardLane();

    expect(results.map(({ label, status }) => [label, status])).toEqual([
      ['presentation-text', 'passed'],
      ['date-time-seam', 'passed'],
    ]);
  });

  it('fails the lane on hard-coded presentation copy', async () => {
    writeSource({
      path: 'apps/web/src/copy.tsx',
      source: 'export const Copy = () => <p>Hard-coded copy</p>;\n',
    });

    const results = await runGuardLane();

    expect(results[0]).toMatchObject({
      label: 'presentation-text',
      status: 'failed',
    });
    expect(results[1]).toMatchObject({
      label: 'date-time-seam',
      status: 'skipped',
    });
  });

  it('fails the lane on a date-time seam suppression', async () => {
    writeSource({
      path: 'apps/web/src/seam.ts',
      source: '// biome-ignore plugin: bypass\nexport const seam = 1;\n',
    });

    const results = await runGuardLane();

    expect(results[1]).toMatchObject({
      label: 'date-time-seam',
      status: 'failed',
    });
  });
});
