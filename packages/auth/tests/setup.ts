import * as schema from '@church/db/schema';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: getTestDatabaseUrl(),
  max: 2,
});

export const testDb = drizzle(pool, { schema });

export async function clearDatabase() {
  await testDb.execute(sql`
    DO $$ 
    DECLARE 
        r RECORD;
    BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'drizzle_migrations') LOOP
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
    END $$;
  `);
}
