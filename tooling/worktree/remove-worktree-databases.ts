import { expectedDatabaseName } from '../../packages/db/src/database-target-resolver';
import {
  DatabaseDropError,
  type DroppedDatabase,
  dropDatabases,
} from '../../packages/db/src/drop-databases';
import {
  LOCAL_DATABASE_SERVER_URL,
  WORKTREE_DATABASE_PURPOSES,
} from './database-targets';
import {
  activeWorktreeIdentities,
  readGeneratedWorktreeIdentity,
} from './local-env';
import { PRIMARY_WORKTREE_IDENTITY } from './worktree-identity';

/**
 * The Worktrunk `pre-remove` hook (ADR-0005), run in the worktree being
 * removed. Drops exactly its three databases, named by the identity in its
 * generated `.env.local`, after terminating their active connections. It
 * never blocks the removal: when PostgreSQL is unavailable, another active
 * worktree holds the same identity, or the drop fails, it warns, keeps the
 * databases, and points to `db:prune`.
 */

const PRUNE_HINT =
  'Once the cause is fixed, `bun run db:prune -- --apply` from any worktree drops them.';

export type RemovalOutcome =
  | { kind: 'dropped'; databases: DroppedDatabase[] }
  | { kind: 'no-identity' }
  | { kind: 'primary' }
  | { kind: 'shared-identity'; worktree: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'failed'; reason: string };

export interface RemoveWorktreeDatabasesInput {
  cwd: string;
  serverUrl: string;
}

interface ReasonInput {
  error: unknown;
}

function reasonOf(input: ReasonInput): string {
  return input.error instanceof Error
    ? input.error.message
    : String(input.error);
}

export async function removeWorktreeDatabases(
  input: RemoveWorktreeDatabasesInput,
): Promise<RemovalOutcome> {
  try {
    const worktree = readGeneratedWorktreeIdentity({ cwd: input.cwd });

    if (worktree === undefined) return { kind: 'no-identity' };
    if (worktree === PRIMARY_WORKTREE_IDENTITY) return { kind: 'primary' };

    const others = activeWorktreeIdentities({
      cwd: input.cwd,
      excludeCurrent: true,
    });
    if (others.has(worktree)) return { kind: 'shared-identity', worktree };

    return {
      kind: 'dropped',
      databases: await dropDatabases({
        serverUrl: input.serverUrl,
        databases: WORKTREE_DATABASE_PURPOSES.map((purpose) =>
          expectedDatabaseName({ purpose, worktree }),
        ),
      }),
    };
  } catch (error) {
    if (error instanceof DatabaseDropError && error.step === 'connect') {
      return { kind: 'unavailable', reason: reasonOf({ error }) };
    }
    return { kind: 'failed', reason: reasonOf({ error }) };
  }
}

interface ReportRemovalInput {
  outcome: RemovalOutcome;
}

function reportRemoval(input: ReportRemovalInput): void {
  const { outcome } = input;

  switch (outcome.kind) {
    case 'dropped':
      for (const { database, existed } of outcome.databases) {
        console.log(
          `worktree removal ${database}: ${existed ? 'dropped' : 'already absent'}`,
        );
      }
      return;
    case 'no-identity':
      console.log(
        'worktree removal: no generated .env.local identity, so no databases to drop.',
      );
      return;
    case 'primary':
      console.log(
        'worktree removal: the primary checkout keeps its databases.',
      );
      return;
    case 'shared-identity':
      console.warn(
        `⚠ worktree removal: another active worktree also holds identity "${outcome.worktree}", so its databases were kept.`,
      );
      return;
    case 'unavailable':
      console.warn(
        `⚠ worktree removal: PostgreSQL is unavailable (${outcome.reason}); this worktree's databases were kept. ${PRUNE_HINT}`,
      );
      return;
    case 'failed':
      console.warn(
        `⚠ worktree removal: ${outcome.reason}; this worktree's databases were kept. ${PRUNE_HINT}`,
      );
      return;
  }
}

async function main(): Promise<void> {
  reportRemoval({
    outcome: await removeWorktreeDatabases({
      cwd: process.cwd(),
      serverUrl: LOCAL_DATABASE_SERVER_URL,
    }),
  });
}

if (import.meta.main) {
  await main();
}
