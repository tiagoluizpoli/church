import {
  type DatabaseTargetIdentity,
  resolveDatabaseTarget,
} from './database-target-resolver';
import {
  developmentCandidateFrom,
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
  worktreeOrUnspecified,
} from './purpose-database-url-guard';

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
  const { identity, databaseUrl } = resolveE2eDatabaseTarget();

  reportDatabaseTarget({ identity });

  return databaseUrl;
}

export interface ResolvedE2eDatabaseTarget {
  identity: DatabaseTargetIdentity;
  databaseUrl: string;
}

/**
 * Same resolution and refusals as `getE2eDatabaseUrl`, without the preflight
 * log — for callers that compare or re-report the target's fingerprint.
 */
export function resolveE2eDatabaseTarget(): ResolvedE2eDatabaseTarget {
  requireExecPurpose({ purpose: 'e2e', functionName: 'getE2eDatabaseUrl' });

  const databaseUrl = requireDatabaseUrl({ purpose: 'e2e' });
  const worktree = worktreeOrUnspecified();

  const identity = resolveDatabaseTarget({
    purpose: 'e2e',
    worktree,
    candidates: {
      development: developmentCandidateFrom({
        databaseUrl,
        worktree,
      }),
      e2e: databaseUrl,
    },
  });

  return { identity, databaseUrl };
}
