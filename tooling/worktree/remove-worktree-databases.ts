import { expectedDatabaseName } from '../../packages/db/src/database-target-resolver';
import {
  DatabaseDropError,
  type DroppedDatabase,
  dropDatabases,
} from '../../packages/db/src/drop-databases';
import type { Instant } from '../../packages/time/src/brands';
import { now } from '../../packages/time/src/now';
import {
  errorMessage,
  tryRecordFailureBundle,
} from '../diagnostics/failure-bundle';
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
 * databases, points to `db:prune`, and leaves a diagnostic bundle in the
 * shared Git directory, which outlives the removed worktree.
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
      return { kind: 'unavailable', reason: errorMessage({ error }) };
    }
    return { kind: 'failed', reason: errorMessage({ error }) };
  }
}

interface OutcomeInput {
  outcome: RemovalOutcome;
}

interface RemovalReport {
  /** The databases were kept although the worktree is going away. */
  kept: boolean;
  lines: string[];
}

function describeRemoval(input: OutcomeInput): RemovalReport {
  const { outcome } = input;

  switch (outcome.kind) {
    case 'dropped':
      return {
        kept: false,
        lines: outcome.databases.map(
          ({ database, existed }) =>
            `worktree removal ${database}: ${existed ? 'dropped' : 'already absent'}`,
        ),
      };
    case 'no-identity':
      return {
        kept: false,
        lines: [
          'worktree removal: no generated .env.local identity, so no databases to drop.',
        ],
      };
    case 'primary':
      return {
        kept: false,
        lines: ['worktree removal: the primary checkout keeps its databases.'],
      };
    case 'shared-identity':
      return {
        kept: true,
        lines: [
          `⚠ worktree removal: another active worktree also holds identity "${outcome.worktree}", so its databases were kept.`,
        ],
      };
    case 'unavailable':
      return {
        kept: true,
        lines: [
          `⚠ worktree removal: PostgreSQL is unavailable (${outcome.reason}); this worktree's databases were kept. ${PRUNE_HINT}`,
        ],
      };
    case 'failed':
      return {
        kept: true,
        lines: [
          `⚠ worktree removal: ${outcome.reason}; this worktree's databases were kept. ${PRUNE_HINT}`,
        ],
      };
  }
}

export interface ReportRemovalInput {
  cwd: string;
  outcome: RemovalOutcome;
  startedAt: Instant;
}

/** Prints the outcome; kept databases also leave a failure bundle. The
 * hook still exits 0, so the bundle records that status. */
export function reportRemoval(input: ReportRemovalInput): void {
  const { kept, lines } = describeRemoval({ outcome: input.outcome });
  const print = kept ? console.warn : console.log;
  for (const line of lines) print(line);
  if (!kept) return;

  tryRecordFailureBundle({
    cwd: input.cwd,
    record: {
      command: 'worktree:remove',
      step: 'databases',
      commandLine: ['bun', 'tooling/worktree/remove-worktree-databases.ts'],
      purpose: null,
      startedAt: input.startedAt,
      finishedAt: now(),
      exitStatus: 0,
      signal: null,
      output: `${lines.join('\n')}\n`,
    },
  });
}

async function main(): Promise<void> {
  const startedAt = now();
  reportRemoval({
    cwd: process.cwd(),
    outcome: await removeWorktreeDatabases({
      cwd: process.cwd(),
      serverUrl: LOCAL_DATABASE_SERVER_URL,
    }),
    startedAt,
  });
}

if (import.meta.main) {
  await main();
}
