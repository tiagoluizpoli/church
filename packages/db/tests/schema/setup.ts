import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { clearPublicTables } from '@/clear-public-tables';
import { getIntegrationDatabaseUrl } from '@/integration-database-url';
import * as schema from '@/schema';

const pool = new pg.Pool({
  connectionString: getIntegrationDatabaseUrl(),
  max: 2,
});

export const testDb = drizzle(pool, { schema });

export async function clearDatabase() {
  await clearPublicTables({ pool });
}
