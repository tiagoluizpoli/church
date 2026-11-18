import { clearPublicTables } from '@church/db/clear-public-tables';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import * as schema from '@church/db/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: getIntegrationDatabaseUrl(),
  max: 2,
});

export const testDb = drizzle(pool, { schema });

export async function clearDatabase() {
  await clearPublicTables({ pool });
}
