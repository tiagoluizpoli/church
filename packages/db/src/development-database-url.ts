import {
  DatabaseTargetError,
  type DatabaseTargetIdentity,
  resolveDatabaseTarget,
} from './database-target-resolver';
import {
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
} from './purpose-database-url-guard';

const PRIMARY_WORKTREE = 'develop';

// Every managed development database is published by the root Compose
// project on loopback; anything else may be a shared or deployed server.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface GetDevelopmentDatabaseUrlInput {
  /** Consulted only when CHURCH_WORKTREE is absent: the primary checkout is
   * the `develop` worktree; a linked worktree has no implicit identity. */
  isPrimaryWorktree: () => boolean;
}

function currentWorktree(input: GetDevelopmentDatabaseUrlInput): string {
  const declaredWorktree = process.env.CHURCH_WORKTREE;
  if (declaredWorktree) return declaredWorktree;

  if (input.isPrimaryWorktree()) return PRIMARY_WORKTREE;

  throw new Error(
    'CHURCH_WORKTREE is not set and this checkout is a linked worktree. Refusing to guess its development database; declare CHURCH_WORKTREE for this worktree.',
  );
}

interface AssertNotProductionLikeInput {
  identity: DatabaseTargetIdentity;
}

/** A destructive development command never runs under a production runtime
 * or against a database server outside this machine. */
function assertNotProductionLike({
  identity,
}: AssertNotProductionLikeInput): void {
  if (process.env.NODE_ENV === 'production') {
    throw new DatabaseTargetError({
      reason: 'production-like-target',
      message:
        'Refusing a production-like development target: NODE_ENV is "production".',
    });
  }

  if (!LOOPBACK_HOSTS.has(identity.host)) {
    throw new DatabaseTargetError({
      reason: 'production-like-target',
      message: `Refusing a production-like development target: host "${identity.host}" is not loopback.`,
    });
  }
}

/**
 * Returns the current worktree's development database target Varlock
 * injected for this process (ADR-0005: `db:reset:dev` may reset only that
 * database). Callers must run through Varlock with
 * `CHURCH_EXEC_PURPOSE=development`; anything else fails fast.
 *
 * Resolves through `resolveDatabaseTarget`, so a URL naming another
 * worktree's database, an integration/E2E database, or anything outside the
 * managed "church" namespace is refused, as is a production-like target (a
 * production runtime or a non-loopback host). Logs the redacted preflight
 * line before returning.
 */
export function getDevelopmentDatabaseUrl(
  input: GetDevelopmentDatabaseUrlInput,
): string {
  requireExecPurpose({
    purpose: 'development',
    functionName: 'getDevelopmentDatabaseUrl',
  });

  const databaseUrl = requireDatabaseUrl({ purpose: 'development' });

  const identity = resolveDatabaseTarget({
    purpose: 'development',
    worktree: currentWorktree(input),
    candidates: { development: databaseUrl },
  });
  assertNotProductionLike({ identity });

  reportDatabaseTarget({ identity });

  return databaseUrl;
}
