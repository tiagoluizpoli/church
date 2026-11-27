import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ISOLATED_SPECS } from '../../../apps/web/tests/fixtures/e2e-lanes';

const SCRIPT_PATH = join(
  import.meta.dir,
  '../../validation/e2e-lanes-guard.ts',
);

let webRoot: string;

const writeSpec = (path: string) => {
  mkdirSync(dirname(join(webRoot, 'tests', path)), { recursive: true });
  writeFileSync(join(webRoot, 'tests', path), '');
};

const runGuard = () => {
  const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--web-root', webRoot], {
    stderr: 'pipe',
  });
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
};

beforeEach(() => {
  webRoot = mkdtempSync(join(tmpdir(), 'e2e-lanes-guard-'));
  for (const spec of ISOLATED_SPECS) writeSpec(spec);
});

afterEach(() => {
  rmSync(webRoot, { force: true, recursive: true });
});

describe('E2E lane list guard command', () => {
  it('exits successfully when every spec is listed', () => {
    expect(runGuard()).toEqual({ exitCode: 0, stderr: '' });
  });

  it('refuses a spec missing from the list, naming the list', () => {
    writeSpec('identity/new.spec.ts');

    expect(runGuard()).toEqual({
      exitCode: 1,
      stderr:
        'E2E lanes (tests/fixtures/e2e-lanes.ts) must list every spec exactly once:\n  unclassified: identity/new.spec.ts\n',
    });
  });
});
