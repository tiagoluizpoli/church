import { resolveDatabaseTarget } from './database-target-resolver';
import {
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
} from './purpose-database-url-guard';

const UNSPECIFIED_WORKTREE_LABEL = 'unspecified';

/**
 * Returns the E2E database target Varlock injected for this process
 * (ADR-0005: e2e has no fallback URL and is never derived from `NODE_ENV`).
 * Callers must run through Varlock with `CHURCH_EXEC_PURPOSE=e2e`; anything
 * else fails fast.
 *
 * Resolves through `resolveDatabaseTarget` (src/database-target-resolver.ts)
 * so every E2E support process — provisioning, invitation minting and
 * redemption, seed, and cleanup — refuses the development database, an
 * integration database, and any database outside the managed "church"
 * namespace, and every caller logs the same redacted preflight line.
 */
export function getE2eDatabaseUrl(): string {
  requireExecPurpose({ purpose: 'e2e', functionName: 'getE2eDatabaseUrl' });

  const databaseUrl = requireDatabaseUrl({ purpose: 'e2e' });

  const developmentDatabaseUrl = process.env.DEVELOPMENT_DATABASE_URL;

  if (!developmentDatabaseUrl) {
    throw new Error(
      'DEVELOPMENT_DATABASE_URL was not resolved for the e2e purpose. It is required to guard e2e work from targeting the development database.',
    );
  }

  const identity = resolveDatabaseTarget({
    purpose: 'e2e',
    worktree: process.env.CHURCH_WORKTREE ?? UNSPECIFIED_WORKTREE_LABEL,
    candidates: { development: developmentDatabaseUrl, e2e: databaseUrl },
  });

  reportDatabaseTarget({ identity });

  return databaseUrl;
}
