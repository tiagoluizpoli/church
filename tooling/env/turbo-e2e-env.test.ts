import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

/**
 * Turbo runs tasks in strict env mode: a variable not declared for the task
 * never reaches its scripts. CI injects the E2E configuration (ADR-0005)
 * through the job environment, so the E2E tasks must pass it through or the
 * server silently loses e.g. ENABLE_DEBUG_ENDPOINTS and its debug routes 404.
 */

interface TurboTask {
  passThroughEnv?: string[];
}

interface TurboConfig {
  tasks: Record<string, TurboTask>;
}

const turboConfig = JSON.parse(
  readFileSync(resolve(import.meta.dir, '../../turbo.json'), 'utf8'),
) as TurboConfig;

const REQUIRED_E2E_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'CORS_ORIGIN',
  'UNLEASH_API_URL',
  'UNLEASH_API_TOKEN',
  'NODE_ENV',
  'ENABLE_DEBUG_ENDPOINTS',
  'VITE_SERVER_URL',
  'CHURCH_WORKTREE',
];

describe('turbo E2E tasks', () => {
  for (const task of ['test:e2e', 'test:e2e:ui']) {
    it(`${task} passes the injected E2E environment through`, () => {
      expect(turboConfig.tasks[task]?.passThroughEnv).toEqual(
        expect.arrayContaining(REQUIRED_E2E_ENV),
      );
    });
  }
});
