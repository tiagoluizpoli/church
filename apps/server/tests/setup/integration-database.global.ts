import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { cloneDatabasesFromTemplate } from '@church/db/provision-databases';
import { integrationWorkerDatabase } from './integration-database-worker';
import { INTEGRATION_WORKER_COUNT } from './integration-worker-count';

export async function setup(): Promise<void> {
  const templateUrl = getIntegrationDatabaseUrl();
  const databaseNames = Array.from(
    { length: INTEGRATION_WORKER_COUNT },
    (_, index) => integrationWorkerDatabase({ workerId: index + 1 }),
  );

  await cloneDatabasesFromTemplate({ templateUrl, databaseNames });
}
