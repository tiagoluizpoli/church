import { sql } from 'drizzle-orm';
import { db } from '../index';

export async function cleanDatabase() {
  console.log('🧹 Cleaning database...');

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DO $$ 
      DECLARE 
          r RECORD;
      BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'drizzle_migrations') LOOP
              EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
      END $$;
    `);
  });

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
