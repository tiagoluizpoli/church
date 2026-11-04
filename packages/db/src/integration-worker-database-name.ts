import { createHash } from 'node:crypto';

const POSTGRES_IDENTIFIER_LIMIT = 63;
const WORKTREE_IDENTITY = /^[a-z0-9_]+$/;
const NAME_PREFIX = 'church_';
const WORKER_MARKER = '__w';
const NAME_SUFFIX = '_int';
/** Linux caps pids at 4194304, so a per-run clone's pid id has 7 digits at most. */
const MAX_WORKER_ID_DIGITS = 7;
const WORKTREE_BUDGET =
  POSTGRES_IDENTIFIER_LIMIT -
  NAME_PREFIX.length -
  WORKER_MARKER.length -
  MAX_WORKER_ID_DIGITS -
  NAME_SUFFIX.length;
const WORKTREE_HASH_LENGTH = 8;

interface WorkerWorktreePortionInput {
  worktree: string;
}

/** The worktree part of a worker name: the identity itself, or, when it would
 * not leave room for a 7-digit worker id, a prefix plus a hash of the whole
 * identity, so long identities stay distinct and prunable. */
function workerWorktreePortion({
  worktree,
}: WorkerWorktreePortionInput): string {
  if (worktree.length <= WORKTREE_BUDGET) {
    return worktree;
  }
  const hash = createHash('sha256')
    .update(worktree)
    .digest('hex')
    .slice(0, WORKTREE_HASH_LENGTH);
  const prefixLength = WORKTREE_BUDGET - WORKTREE_HASH_LENGTH - 1;
  return `${worktree.slice(0, prefixLength)}_${hash}`;
}

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
  const valid = WORKTREE_IDENTITY.test(worktree);
  const portion = valid ? workerWorktreePortion({ worktree }) : worktree;
  const name = `${NAME_PREFIX}${portion}${WORKER_MARKER}${workerId}${NAME_SUFFIX}`;
  if (!valid || name.length > POSTGRES_IDENTIFIER_LIMIT) {
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
  const portion =
    worktree === undefined ? '[a-z0-9_]+' : workerWorktreePortion({ worktree });
  return new RegExp(
    `^${NAME_PREFIX}${portion}${WORKER_MARKER}[1-9][0-9]*${NAME_SUFFIX}$`,
  ).test(database);
}
