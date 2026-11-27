import type { ReporterDescription } from '@playwright/test';

export interface E2eReportersInput {
  env: NodeJS.ProcessEnv;
}

/**
 * The Playwright reporters. The outcome reporter lets global teardown keep a
 * failed run's E2E database state for diagnosis instead of cleaning it. On
 * GitHub Actions, `github` also turns each failed test into a PR annotation
 * (#1162). It goes first: off a terminal, `list` ends a test's row only when
 * the next output arrives, so an annotation written after it would land
 * mid-line, where GitHub ignores it.
 */
export function e2eReporters({
  env,
}: E2eReportersInput): ReporterDescription[] {
  const local: ReporterDescription[] = [
    ['list'],
    ['./tests/fixtures/e2e-run-outcome.ts'],
  ];
  return env.GITHUB_ACTIONS === 'true' ? [['github'], ...local] : local;
}
