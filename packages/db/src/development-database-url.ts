import { resolveDatabaseTarget } from './database-target-resolver';
import {
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
} from './purpose-database-url-guard';

const PRIMARY_WORKTREE = 'develop';

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

/**
 * Returns the current worktree's development database target Varlock
 * injected for this process (ADR-0005: `db:reset:dev` may reset only that
 * database). Callers must run through Varlock with
 * `CHURCH_EXEC_PURPOSE=development`; anything else fails fast.
 *
 * Resolves through `resolveDatabaseTarget`, so a URL naming another
 * worktree's database, an integration/E2E database, or anything outside the
 * managed "church" namespace is refused, and logs the redacted preflight
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

  reportDatabaseTarget({ identity });

  return databaseUrl;
}
