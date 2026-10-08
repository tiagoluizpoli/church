import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';
import { assertE2eEnvironment } from '../../../tooling/env/e2e-environment';
import {
  clearE2eRunFailure,
  describeE2eFailure,
  recordE2eRunFailure,
} from './fixtures/e2e-run-outcome';
import { parseLastJsonLine, runE2eServerScript } from './fixtures/e2e-target';
import { requiredE2eUrl } from './fixtures/e2e-urls';
import {
  type PersonaCredentials,
  resolveActiveChurch,
  signInPersona,
} from './fixtures/persona-session';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  SHARED_PERSONAS_FILE,
  SHARED_PERSONAS_KEY,
  SHARED_PERSONAS_RECIPE,
  SHARED_PERSONAS_SCHEMA,
  type SharedPersonas,
  VOLUNTEER_STORAGE_STATE,
} from './fixtures/shared-personas';
import { resetE2eDatabase } from './global-teardown';

/**
 * Playwright global setup, once per run before any worker starts (#320
 * decision 19):
 *
 *  1. Empty this worktree's E2E database.
 *  2. Load the server's `shared-personas` recipe: the suite's read-only
 *     ChurchAdmin and Volunteer, and the local Platform Operator every
 *     journey Church is provisioned by.
 *  3. Sign each persona in, resolve its Active Church, and save its storage
 *     state; save the recipe's result for the specs that sign in themselves.
 *
 * Every journey that mutates domain data loads its own recipe per test
 * (`fixtures/journey-recipes.ts`).
 */

interface SaveSessionInput {
  serverUrl: string;
  credentials: PersonaCredentials;
  storageState: string;
}

async function saveSession({
  serverUrl,
  credentials,
  storageState,
}: SaveSessionInput): Promise<void> {
  const context = await request.newContext({ baseURL: serverUrl });
  try {
    await signInPersona({ request: context, credentials });
    await resolveActiveChurch({ request: context, name: credentials.name });
    await context.storageState({ path: storageState });
  } finally {
    await context.dispose();
  }
}

function loadSharedPersonas(): SharedPersonas {
  const output = runE2eServerScript({
    scriptPath: 'seeds/e2e/load-journey-recipe.ts',
    args: [SHARED_PERSONAS_RECIPE, `--key=${SHARED_PERSONAS_KEY}`],
    step: `load ${SHARED_PERSONAS_RECIPE} recipe`,
  });
  return parseLastJsonLine({ output, schema: SHARED_PERSONAS_SCHEMA });
}

/** Starts a run: forgets the previous run's outcome, and records a failure
 * here itself — Playwright runs global teardown before any reporter hears of
 * a global-setup error, and teardown must keep this state for diagnosis. */
export default async function globalSetup(): Promise<void> {
  clearE2eRunFailure();

  try {
    await provisionE2eRun();
  } catch (error) {
    recordE2eRunFailure({
      reason: `global setup failed: ${describeE2eFailure({ error })}`,
    });
    throw error;
  }
}

async function provisionE2eRun(): Promise<void> {
  // Before anything provisions or deletes: a mismatched purpose, database
  // target, or URL set fails here, ahead of the destructive cleanup below.
  assertE2eEnvironment();

  // Reset the target before seeding: a failed or aborted run leaves its data
  // in place for diagnosis (see global-teardown.ts).
  resetE2eDatabase();

  const serverUrl = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
  const shared = loadSharedPersonas();

  mkdirSync(path.dirname(SHARED_PERSONAS_FILE), { recursive: true });
  writeFileSync(SHARED_PERSONAS_FILE, JSON.stringify(shared));

  await Promise.all([
    saveSession({
      serverUrl,
      credentials: shared.personas.churchAdmin,
      storageState: CHURCH_ADMIN_STORAGE_STATE,
    }),
    saveSession({
      serverUrl,
      credentials: shared.personas.volunteer,
      storageState: VOLUNTEER_STORAGE_STATE,
    }),
  ]);
}
