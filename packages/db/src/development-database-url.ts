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

// Every managed development database is published by the root Compose
// project on loopback; anything else may be a shared or deployed server.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `env:local` declares CHURCH_WORKTREE in every checkout, the primary
 * (`develop`) included; a checkout without one has no implicit identity. */
function currentWorktree(): string {
  const declaredWorktree = process.env.CHURCH_WORKTREE;
  if (declaredWorktree) return declaredWorktree;

  throw new Error(
    'CHURCH_WORKTREE is not set. Refusing to guess the development database; run `bun run env:local` to declare this worktree.',
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
export function getDevelopmentDatabaseUrl(): string {
  requireExecPurpose({
    purpose: 'development',
    functionName: 'getDevelopmentDatabaseUrl',
  });

  const databaseUrl = requireDatabaseUrl({ purpose: 'development' });

  const identity = resolveDatabaseTarget({
    purpose: 'development',
    worktree: currentWorktree(),
    candidates: { development: databaseUrl },
  });
  assertNotProductionLike({ identity });

  reportDatabaseTarget({ identity });

  return databaseUrl;
}
