import {
  expectedDatabaseName,
  resolveDatabaseTarget,
} from './database-target-resolver';
import {
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
} from './purpose-database-url-guard';

const UNSPECIFIED_WORKTREE_LABEL = 'unspecified';

interface DevelopmentCandidateFromInput {
  e2eDatabaseUrl: string;
  worktree: string;
}

/**
 * Synthesizes the development-database candidate `resolveDatabaseTarget`
 * compares against, from the e2e URL's own host/port (ADR-0005: every
 * purpose's database lives on the same worktree Postgres instance, only the
 * database name differs). Avoids depending on a separate injected env var
 * that Varlock only forwards for `@required` keys — this stays derivable
 * from what CHURCH_EXEC_PURPOSE=e2e already guarantees is present.
 */
function developmentCandidateFrom(
  input: DevelopmentCandidateFromInput,
): string {
  const developmentUrl = new URL(input.e2eDatabaseUrl);
  developmentUrl.pathname = `/${expectedDatabaseName({ purpose: 'development', worktree: input.worktree })}`;
  return developmentUrl.toString();
}

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
  const worktree = process.env.CHURCH_WORKTREE ?? UNSPECIFIED_WORKTREE_LABEL;

  const identity = resolveDatabaseTarget({
    purpose: 'e2e',
    worktree,
    candidates: {
      development: developmentCandidateFrom({
        e2eDatabaseUrl: databaseUrl,
        worktree,
      }),
      e2e: databaseUrl,
    },
  });

  reportDatabaseTarget({ identity });

  return databaseUrl;
}
