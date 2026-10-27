import { integrationWorkerDatabaseName } from '@church/db/integration-worker-database-name';
import { worktreeOrUnspecified } from '@church/db/purpose-database-url-guard';

export const INTEGRATION_WORKER_COUNT = 2;

interface WorkerDatabaseInput {
  workerId: number;
}

export function integrationWorkerDatabase(input: WorkerDatabaseInput): string {
  return integrationWorkerDatabaseName({
    worktree: worktreeOrUnspecified(),
    workerId: input.workerId,
  });
}

/** Points this worker's `DATABASE_URL` at its own clone; the cloning itself
 * is `integration-database.global.ts`. */
export function configureIntegrationWorkerDatabase(): void {
  const workerId = Number(process.env.VITEST_POOL_ID);
  if (!Number.isSafeInteger(workerId) || workerId < 1) {
    throw new Error('Vitest did not provide a valid integration worker id.');
  }

  if (workerId > INTEGRATION_WORKER_COUNT) {
    throw new Error(
      `Integration worker ${workerId} has no cloned database (cap ${INTEGRATION_WORKER_COUNT}).`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for integration tests.');

  const url = new URL(databaseUrl);
  url.pathname = `/${integrationWorkerDatabase({ workerId })}`;
  process.env.DATABASE_URL = url.toString();
}
