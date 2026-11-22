import {
  dropDatabases,
  isWorktreeDatabaseName,
  listWorktreeDatabases,
} from '../../packages/db/src/drop-databases';
import { LOCAL_DATABASE_SERVER_URL } from './database-targets';
import { activeWorktreeIdentities } from './local-env';
import {
  deleteBucket,
  listBuckets,
  localStorageClient,
} from './storage-buckets';
import { BUCKET_PREFIX, worktreeBucketName } from './storage-targets';

/**
 * `bun run db:prune [-- --apply]`: recovers databases and `church-<worktree>`
 * storage buckets a worktree removal left behind (PostgreSQL or storage was
 * down, or hooks were skipped) (ADR-0005). Compares
 * the worktree database namespace with this repository's active worktrees
 * and reports the stale ones; only `--apply` drops them. `church` and every
 * database outside `church_<worktree>_<dev|int|e2e>` are never selected.
 *
 * An active worktree owns every `church_<identity>_…` database, including the
 * scratch databases its integration tests create, so nothing a still-present
 * worktree may be using is touched. A stale worktree whose identity extends
 * an active one (`feature_x` beside `feature`) is therefore kept until that
 * active worktree is gone too.
 */

const APPLY_FLAG = '--apply';

export interface SelectStaleDatabasesInput {
  databases: string[];
  activeIdentities: Set<string>;
}

export function selectStaleDatabases(
  input: SelectStaleDatabasesInput,
): string[] {
  const ownedPrefixes = [...input.activeIdentities].map(
    (worktree) => `church_${worktree}_`,
  );

  return input.databases.filter(
    (database) =>
      isWorktreeDatabaseName({ database }) &&
      !ownedPrefixes.some((prefix) => database.startsWith(prefix)),
  );
}

export interface SelectStaleBucketsInput {
  buckets: string[];
  activeIdentities: Set<string>;
}

export function selectStaleBuckets(input: SelectStaleBucketsInput): string[] {
  const owned = new Set(
    [...input.activeIdentities].map((worktree) =>
      worktreeBucketName({ worktree }),
    ),
  );

  return input.buckets.filter(
    (bucket) => bucket.startsWith(BUCKET_PREFIX) && !owned.has(bucket),
  );
}

interface ArgvInput {
  argv: string[];
}

function parseApply(input: ArgvInput): boolean {
  const unknown = input.argv.filter((arg) => arg !== APPLY_FLAG);

  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument ${unknown.join(' ')}; the only option is ${APPLY_FLAG}.`,
    );
  }

  return input.argv.includes(APPLY_FLAG);
}

async function prune(input: ArgvInput): Promise<void> {
  const apply = parseApply(input);
  const activeIdentities = activeWorktreeIdentities({ cwd: process.cwd() });
  const stale = selectStaleDatabases({
    databases: await listWorktreeDatabases({
      serverUrl: LOCAL_DATABASE_SERVER_URL,
    }),
    activeIdentities,
  });
  const client = localStorageClient();
  const staleBuckets = selectStaleBuckets({
    buckets: await listBuckets({ client }),
    activeIdentities,
  });

  if (stale.length + staleBuckets.length === 0) {
    console.log('db:prune: no stale worktree databases or buckets.');
    return;
  }

  if (!apply) {
    for (const name of [...stale, ...staleBuckets]) {
      console.log(`db:prune stale: ${name}`);
    }
    console.log(
      `db:prune: ${stale.length + staleBuckets.length} stale; rerun with \`bun run db:prune -- ${APPLY_FLAG}\` to drop them.`,
    );
    return;
  }

  const dropped = await dropDatabases({
    serverUrl: LOCAL_DATABASE_SERVER_URL,
    databases: stale,
  });

  for (const { database, existed } of dropped) {
    console.log(
      `db:prune ${database}: ${existed ? 'dropped' : 'already absent'}`,
    );
  }

  for (const bucket of staleBuckets) {
    const existed = await deleteBucket({ client, bucket });
    console.log(
      `db:prune ${bucket}: ${existed ? 'deleted' : 'already absent'}`,
    );
  }
}

async function main(): Promise<void> {
  try {
    await prune({ argv: process.argv.slice(2) });
  } catch (error) {
    console.error(
      `✖ db:prune failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      'Nothing past the failure was dropped; fix the cause (`bun run db:start` if PostgreSQL or the storage service is down), then rerun.',
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
