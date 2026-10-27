const POSTGRES_IDENTIFIER_LIMIT = 63;
const WORKTREE_IDENTITY = /^[a-z0-9_]+$/;

export interface IntegrationWorkerDatabaseNameInput {
  worktree: string;
  workerId: number;
}

/** The one place a per-worker integration database is named, so provisioning,
 * server test setup and worktree removal cannot drift apart. */
export function integrationWorkerDatabaseName(
  input: IntegrationWorkerDatabaseNameInput,
): string {
  const { worktree, workerId } = input;
  if (!Number.isSafeInteger(workerId) || workerId < 1) {
    throw new Error(`"${workerId}" is not a valid integration worker id.`);
  }
  const name = `church_${worktree}__w${workerId}_int`;
  if (
    !WORKTREE_IDENTITY.test(worktree) ||
    name.length > POSTGRES_IDENTIFIER_LIMIT
  ) {
    throw new Error(
      `"${name}" is not a valid integration worker database name (lowercase letters, digits and underscores, at most ${POSTGRES_IDENTIFIER_LIMIT} characters).`,
    );
  }
  return name;
}

export interface IsIntegrationWorkerDatabaseNameInput {
  database: string;
  /** Limits the match to this worktree's workers; any worktree when omitted. */
  worktree?: string;
}

export function isIntegrationWorkerDatabaseName(
  input: IsIntegrationWorkerDatabaseNameInput,
): boolean {
  const { database, worktree } = input;
  if (worktree !== undefined && !WORKTREE_IDENTITY.test(worktree)) {
    return false;
  }
  return new RegExp(
    `^church_${worktree ?? '[a-z0-9_]+'}__w[1-9][0-9]*_int$`,
  ).test(database);
}
