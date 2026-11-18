import pg from 'pg';
import { getDevelopmentDatabaseUrl } from '../development-database-url';

export async function cleanDatabase() {
  // Refuses any target but this worktree's development database, after a
  // redacted preflight (same guard as db:reset:dev).
  const pool = new pg.Pool({
    connectionString: getDevelopmentDatabaseUrl(),
    max: 1,
  });
  console.log('🧹 Cleaning database...');

  try {
    // One DO block: a single statement, so it runs atomically.
    await pool.query(`
      DO $$ 
      DECLARE 
          r RECORD;
      BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'drizzle_migrations') LOOP
              EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
      END $$;
    `);
  } finally {
    await pool.end();
  }

  console.log('✅ Database cleaned successfully.');
}

if (import.meta.main) {
  cleanDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}
