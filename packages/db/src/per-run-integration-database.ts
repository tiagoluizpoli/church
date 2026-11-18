import { dropDatabases } from './drop-databases';
import { getIntegrationDatabaseUrl } from './integration-database-url';
import { integrationWorkerDatabaseName } from './integration-worker-database-name';
import { cloneDatabasesFromTemplate } from './provision-databases';
import { worktreeOrUnspecified } from './purpose-database-url-guard';

/**
 * Vitest `globalSetup` for the `@church/db` and `@church/auth` suites: clones
 * the worktree's migrated integration database into one per-run database,
 * points `DATABASE_URL` at it (test workers inherit it) and returns the
 * teardown that drops it, so the shared database is never written to. The
 * clone is named like a server worker database (the pid stands in for the
 * worker id, so concurrent runs never collide), which keeps `db:prune`
 * covering clones that a killed run leaves behind.
 */
export async function setupPerRunIntegrationDatabase(): Promise<
  () => Promise<void>
> {
  const templateUrl = getIntegrationDatabaseUrl();
  const database = integrationWorkerDatabaseName({
    worktree: worktreeOrUnspecified(),
    workerId: process.pid,
  });

  await cloneDatabasesFromTemplate({ templateUrl, databaseNames: [database] });

  const url = new URL(templateUrl);
  url.pathname = `/${database}`;
  process.env.DATABASE_URL = url.toString();

  return async () => {
    await dropDatabases({ serverUrl: templateUrl, databases: [database] });
  };
}
