import {
  type DatabasePurpose,
  resolveDatabaseTarget,
} from '../../packages/db/src/database-target-resolver';
import { provisionDatabases } from '../../packages/db/src/provision-databases';
import {
  WORKTREE_DATABASE_PURPOSES,
  worktreeDatabaseUrls,
} from './database-targets';
import { readGeneratedWorktreeIdentity } from './local-env';

/**
 * `bun run db:bootstrap`: creates and migrates the current worktree's
 * development, integration, and E2E databases (ADR-0005) from the identity
 * in its generated `.env.local`. Rerunnable: existing databases are reused,
 * pending migrations applied, nothing is seeded or dropped. A failure names
 * its step and keeps whatever already succeeded for diagnosis.
 */

// The dedicated test databases first: a development database that fails to
// migrate (the primary's long-lived `church`) must not block them.
const PROVISIONING_ORDER: DatabasePurpose[] = [
  'integration',
  'e2e',
  'development',
];

async function bootstrapDatabases(): Promise<void> {
  const worktree = readGeneratedWorktreeIdentity({ cwd: process.cwd() });

  if (!worktree) {
    throw new Error(
      'This worktree has no generated .env.local identity. Run `bun run env:local` first, then rerun.',
    );
  }

  const urls = worktreeDatabaseUrls({ worktree });

  // Every target must be exactly what its purpose resolver will accept.
  for (const purpose of WORKTREE_DATABASE_PURPOSES) {
    resolveDatabaseTarget({ purpose, worktree, candidates: urls });
  }

  const provisioned = await provisionDatabases({
    databaseUrls: PROVISIONING_ORDER.map((purpose) => urls[purpose]),
  });

  for (const { database, created } of provisioned) {
    console.log(
      `db:bootstrap ${database}: ${created ? 'created' : 'exists'}, migrated`,
    );
  }
}

async function main(): Promise<void> {
  try {
    await bootstrapDatabases();
  } catch (error) {
    console.error(
      `✖ db:bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      'Completed databases are kept; fix the cause (`bun run db:start` if PostgreSQL is down), then rerun `bun run db:bootstrap`.',
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
