import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ROSTERING_CHURCH_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
} from './journeys/rostering-church';

/**
 * The suite's shared read-only personas (#320 decision 19): global setup
 * loads the server's `shared-personas` recipe once, signs each persona in,
 * and saves its storage state here before any worker starts. A spec may act
 * as them; one that mutates domain data loads its own journey recipe.
 */

const AUTH_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.auth',
);

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES.sharedPersonas`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
export const SHARED_PERSONAS_RECIPE = 'shared-personas';

/** One graph for the whole suite, so every run reloads the same ids. */
export const SHARED_PERSONAS_KEY = 'suite';

export const CHURCH_ADMIN_STORAGE_STATE = path.join(
  AUTH_DIR,
  'church-admin.json',
);
export const VOLUNTEER_STORAGE_STATE = path.join(AUTH_DIR, 'volunteer.json');

/** The recipe's result, which global setup saves for the specs. */
export const SHARED_PERSONAS_FILE = path.join(AUTH_DIR, 'shared-personas.json');

export const SHARED_PERSONAS_SCHEMA = z.object({
  church: ROSTERING_CHURCH_SCHEMA,
  personas: z.object({
    churchAdmin: ROSTERING_PERSONA_SCHEMA,
    volunteer: ROSTERING_PERSONA_SCHEMA,
  }),
});

export type SharedPersonas = z.infer<typeof SHARED_PERSONAS_SCHEMA>;

/** The shared personas global setup loaded for this run. */
export function readSharedPersonas(): SharedPersonas {
  return SHARED_PERSONAS_SCHEMA.parse(
    JSON.parse(readFileSync(SHARED_PERSONAS_FILE, 'utf8')),
  );
}
