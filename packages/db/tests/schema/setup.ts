import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getIntegrationDatabaseUrl } from '../../src/integration-database-url';
import * as schema from '../../src/schema';

const pool = new pg.Pool({
  connectionString: getIntegrationDatabaseUrl(),
  max: 2,
});

export const testDb = drizzle(pool, { schema });

export async function clearDatabase() {
  await testDb.execute(sql`
    DO $$
    DECLARE 
        table_names text;
    BEGIN
        SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO table_names
        FROM pg_tables
        WHERE schemaname = 'public';

        IF table_names IS NOT NULL THEN
            EXECUTE 'TRUNCATE TABLE ' || table_names || ' CASCADE';
        END IF;
    END $$;
  `);
}
