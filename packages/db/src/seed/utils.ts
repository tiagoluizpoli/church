import { env } from '@base-fullstack-template/env/server';
import { sql } from 'drizzle-orm';
import { db } from '../client';

export async function truncateAllTables() {
  if (env.NODE_ENV === 'production') {
    throw new Error('🚫 Cannot reset database in production environment');
  }

  console.log('🔄 Resetting database using TRUNCATE CASCADE...');

  // Get all table names from the public schema
  const query = sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name != 'drizzle_migrations'
    ORDER BY table_name;
  `;

  const tables = (await db.execute(query)) as unknown as {
    rows: { table_name: string }[];
  };

  if (tables.rows.length === 0) return;

  const tableNames = tables.rows.map((row) => `"${row.table_name}"`).join(', ');
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`),
  );

  console.log('✨ Database reset complete.');
}

export function logStep(message: string) {
  console.log(`\n📦 ${message}`);
}

export function logSuccess(message: string) {
  console.log(`✅ ${message}`);
}
