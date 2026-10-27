import { scratchDatabaseName } from '@church/db/scratch-database-name';

export const INTEGRATION_WORKER_COUNT = 1;

interface WorkerDatabaseInput {
  workerId: number;
}

export function integrationWorkerDatabaseName(
  input: WorkerDatabaseInput,
): string {
  return scratchDatabaseName({ purpose: `w${input.workerId}`, kind: 'int' });
}

export function configureIntegrationWorkerDatabase(): void {
  const workerId = Number(process.env.VITEST_POOL_ID);
  if (!Number.isSafeInteger(workerId) || workerId < 1) {
    throw new Error('Vitest did not provide a valid integration worker id.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for integration tests.');

  const url = new URL(databaseUrl);
  url.pathname = `/${integrationWorkerDatabaseName({ workerId })}`;
  process.env.DATABASE_URL = url.toString();
  process.env.CHURCH_INTEGRATION_BASE_DATABASE_URL = databaseUrl;
  process.env.CHURCH_INTEGRATION_WORKER_ID = String(workerId);
}
