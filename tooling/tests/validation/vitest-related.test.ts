import { describe, expect, it } from 'bun:test';
import { needsWholeSuite } from '../../validation/vitest-related';

describe('needsWholeSuite', () => {
  it('runs the whole suite when no test imports the changed files', () => {
    expect(
      needsWholeSuite({
        exitCode: 0,
        output: 'No affected test files found, exiting with code 0\n',
      }),
    ).toBe(true);
  });

  it('keeps a passing related run', () => {
    expect(
      needsWholeSuite({ exitCode: 0, output: 'Test Files  2 passed (2)\n' }),
    ).toBe(false);
  });

  it('never reruns after a real failure', () => {
    expect(
      needsWholeSuite({ exitCode: 1, output: 'Test Files  1 failed (1)\n' }),
    ).toBe(false);
  });
});
