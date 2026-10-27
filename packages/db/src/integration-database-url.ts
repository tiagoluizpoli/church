import { resolveDatabaseTarget } from './database-target-resolver';
import {
  developmentCandidateFrom,
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
  worktreeOrUnspecified,
} from './purpose-database-url-guard';
import { scratchDatabaseName } from './scratch-database-name';

/**
 * Returns the integration database target Varlock injected for this process
 * (ADR-0005: integration has no fallback URL and is never derived from
 * `NODE_ENV`). Callers must run through Varlock with
 * `CHURCH_EXEC_PURPOSE=integration`; anything else fails fast.
 *
 * Resolves through `resolveDatabaseTarget` (src/database-target-resolver.ts),
 * so it refuses the development database, an E2E database, another
 * worktree's integration database, and any database outside the managed
 * "church" namespace. Every caller (packages/db, packages/auth, apps/server)
 * resolves through this one function, so the redacted preflight line it logs
 * is directly comparable across all three integration runners.
 */
export function getIntegrationDatabaseUrl(): string {
  requireExecPurpose({
    purpose: 'integration',
    functionName: 'getIntegrationDatabaseUrl',
  });

  const databaseUrl =
    process.env.CHURCH_INTEGRATION_BASE_DATABASE_URL ??
    requireDatabaseUrl({ purpose: 'integration' });
  const worktree = worktreeOrUnspecified();

  const identity = resolveDatabaseTarget({
    purpose: 'integration',
    worktree,
    candidates: {
      development: developmentCandidateFrom({ databaseUrl, worktree }),
      integration: databaseUrl,
    },
  });

  reportDatabaseTarget({ identity });

  const workerId = process.env.CHURCH_INTEGRATION_WORKER_ID;
  if (workerId !== undefined) {
    const parsedWorkerId = Number(workerId);
    if (!Number.isSafeInteger(parsedWorkerId) || parsedWorkerId < 1) {
      throw new Error(
        'CHURCH_INTEGRATION_WORKER_ID must be a positive integer.',
      );
    }
    const workerUrl = new URL(databaseUrl);
    workerUrl.pathname = `/${scratchDatabaseName({ purpose: `w${parsedWorkerId}`, kind: 'int' })}`;
    return workerUrl.toString();
  }

  return databaseUrl;
}
