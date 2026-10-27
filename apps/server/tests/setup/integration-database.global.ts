import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { cloneDatabasesFromTemplate } from '@church/db/provision-databases';
import {
  INTEGRATION_WORKER_COUNT,
  integrationWorkerDatabase,
} from './integration-database-worker';

export async function setup(): Promise<void> {
  const templateUrl = getIntegrationDatabaseUrl();
  const databaseNames = Array.from(
    { length: INTEGRATION_WORKER_COUNT },
    (_, index) => integrationWorkerDatabase({ workerId: index + 1 }),
  );

  await cloneDatabasesFromTemplate({ templateUrl, databaseNames });
}
