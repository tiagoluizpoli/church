import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getIntegrationDatabaseUrl } from '../../src/integration-database-url';
import * as schema from '../../src/schema';
import { clearPublicTables } from '@/clear-public-tables';

const pool = new pg.Pool({
  connectionString: getIntegrationDatabaseUrl(),
  max: 2,
});

export const testDb = drizzle(pool, { schema });

export async function clearDatabase() {
  await clearPublicTables({ pool });
}
