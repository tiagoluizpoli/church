import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertEveryE2eSpecHasOneLane,
  E2E_TEST_DIR,
  ISOLATED_SPECS,
  laneTestMatch,
  SHARED_SEED_SPECS,
} from './e2e-lanes';

// A spec outside every lane would run nowhere (or, with a catch-all lane,
// silently in parallel against shared seed state); the config load must fail.
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
        sharedSeedSpecs: SHARED_SEED_SPECS,
        isolatedSpecs: ISOLATED_SPECS,
      }),
    ).not.toThrow();
  });

  it('accepts specs split across both lanes', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        sharedSeedSpecs: ['scheduling/a.spec.ts'],
        isolatedSpecs: ['scheduling/b.spec.ts'],
      }),
    ).not.toThrow();
  });

  it('rejects a spec in no lane', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        sharedSeedSpecs: ['scheduling/a.spec.ts'],
        isolatedSpecs: [],
      }),
    ).toThrow('unclassified: scheduling/b.spec.ts');
  });

  it('rejects a spec in both lanes', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        sharedSeedSpecs: ['scheduling/a.spec.ts', 'scheduling/b.spec.ts'],
        isolatedSpecs: ['scheduling/b.spec.ts'],
      }),
    ).toThrow('in more than one lane: scheduling/b.spec.ts');
  });

  it('rejects a listed spec that no longer exists', () => {
    expect(() =>
      assertEveryE2eSpecHasOneLane({
        testDir,
        sharedSeedSpecs: ['scheduling/a.spec.ts', 'scheduling/gone.spec.ts'],
        isolatedSpecs: ['scheduling/b.spec.ts'],
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
