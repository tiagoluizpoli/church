import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertEveryE2eSpecHasOneLane,
  E2E_TEST_DIR,
  ISOLATED_SPECS,
  laneTestMatch,
} from './e2e-lanes';

// A spec outside the lane would run nowhere; the config load must fail.
describe('E2E lanes', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'e2e-lanes-'));
    mkdirSync(path.join(testDir, 'scheduling'));
    writeFileSync(path.join(testDir, 'scheduling/a.spec.ts'), '');
    writeFileSync(path.join(testDir, 'scheduling/b.spec.ts'), '');
    writeFileSync(path.join(testDir, 'scheduling/c.helpers.ts'), '');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('classifies every real spec exactly once', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir: E2E_TEST_DIR,
        isolatedSpecs: ISOLATED_SPECS,
      }),
    ).not.toThrow();
  });

  it('accepts every spec listed once', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        isolatedSpecs: ['scheduling/a.spec.ts', 'scheduling/b.spec.ts'],
      }),
    ).not.toThrow();
  });

  it('rejects a spec in no lane', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        isolatedSpecs: ['scheduling/a.spec.ts'],
      }),
    ).toThrow('unclassified: scheduling/b.spec.ts');
  });

  it('rejects a spec listed twice', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        isolatedSpecs: [
          'scheduling/a.spec.ts',
          'scheduling/b.spec.ts',
          'scheduling/b.spec.ts',
        ],
      }),
    ).toThrow('listed more than once: scheduling/b.spec.ts');
  });

  it('rejects a listed spec that no longer exists', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        isolatedSpecs: [
          'scheduling/a.spec.ts',
          'scheduling/b.spec.ts',
          'scheduling/gone.spec.ts',
        ],
      }),
    ).toThrow('listed but not found: scheduling/gone.spec.ts');
  });

  it('matches only the exact listed file', () => {
    const [pattern] = laneTestMatch({ specs: ['scheduling/smoke.spec.ts'] });

    expect(
      pattern.test(path.join(E2E_TEST_DIR, 'scheduling/smoke.spec.ts')),
    ).toBe(true);
    expect(
      pattern.test(path.join(E2E_TEST_DIR, 'scheduling/xsmoke.spec.ts')),
    ).toBe(false);
    expect(
      pattern.test(path.join(E2E_TEST_DIR, 'scheduling/smoke.spec.ts.bak')),
    ).toBe(false);
    expect(
      pattern.test(path.join(E2E_TEST_DIR, 'notscheduling/smoke.spec.ts')),
    ).toBe(false);
    // Any root the test directory resolves to (e.g. through a symlink).
    expect(pattern.test('/elsewhere/tests/scheduling/smoke.spec.ts')).toBe(
      true,
    );
  });
});
