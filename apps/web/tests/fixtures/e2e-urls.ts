/**
 * #263 / ADR-0005: E2E specs never fall back to a local URL. `playwright.config.ts`
 * pins the run's URL set (`applyE2eUrlSet`) before any worker or global setup
 * loads, so a missing variable means the run bypassed the config.
 */
export interface RequiredE2eUrlInput {
  variable: 'VITE_SERVER_URL' | 'PW_WEB_URL';
}

export function requiredE2eUrl(input: RequiredE2eUrlInput): string {
  const pinned = process.env[input.variable];
  if (!pinned) {
    throw new Error(
      `${input.variable} is not set: run E2E through \`bun run test:e2e\` so the Playwright config pins the URL set.`,
    );
  }
  return pinned;
}
