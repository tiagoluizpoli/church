import { describe, expect, it } from 'vitest';
import { e2eReporters } from './e2e-reporters';

// #1162: on GitHub Actions a failed journey shows on the PR as an annotation.

describe('e2eReporters', () => {
  it('keeps the list and run-outcome reporters for a local run', () => {
    expect(e2eReporters({ env: {} })).toEqual([
      ['list'],
      ['./tests/fixtures/e2e-run-outcome.ts'],
    ]);
  });

  // Off a terminal, `list` ends a test's row only when the next output
  // arrives, so a `github` reporter after it glued each `::error` onto that
  // row, where GitHub ignores it. Placed first, every annotation starts its
  // line.
  it('puts the GitHub reporter first on GitHub Actions', () => {
    expect(e2eReporters({ env: { GITHUB_ACTIONS: 'true' } })).toEqual([
      ['github'],
      ['list'],
      ['./tests/fixtures/e2e-run-outcome.ts'],
    ]);
  });
});

// THROWAWAY (#1162 proof): fails on purpose; delete with the branch.
it('throwaway #1162: web unit fails on purpose', () => {
  expect(1 + 1).toBe(3);
});
