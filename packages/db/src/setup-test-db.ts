import { getIntegrationDatabaseUrl } from './integration-database-url';
import { provisionDatabases } from './provision-databases';

export async function setupTestDatabase(): Promise<void> {
  await provisionDatabases({ databaseUrls: [getIntegrationDatabaseUrl()] });
}

if (import.meta.main) {
  setupTestDatabase()
    .then(() => {
      console.log('Test database is ready.');
    })
    .catch((error) => {
      console.error('Failed to set up test database.');
      console.error(error);
      process.exitCode = 1;
    });
}
