import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../src/schema';
import { getTestDatabaseUrl } from '../../src/test-database-url';

const pool = new pg.Pool({
  connectionString: getTestDatabaseUrl(),
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
