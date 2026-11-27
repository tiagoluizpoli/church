import { describe, expect, it } from 'vitest';

// Smoke test for the `integration` project (node env). Real-service
// integration suites (against the dev DB / API) live alongside their features
// as `*.integration.test.ts`.
describe('vitest integration project', () => {
  it('runs in a node environment', () => {
    expect(typeof window).toBe('undefined');
  });
});

// THROWAWAY (#1162 proof): fails on purpose; delete with the branch.
it('throwaway #1162: web integration fails on purpose', () => {
  expect(1 + 1).toBe(3);
});
