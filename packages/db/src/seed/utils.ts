import { env } from '@church/env/server';
import type pg from 'pg';

export interface TruncateAllTablesInput {
  /** Connected to the target the caller already resolved. */
  pool: pg.Pool;
}

interface TableNameRow {
  tableName: string;
}

export async function truncateAllTables({ pool }: TruncateAllTablesInput) {
  if (env.NODE_ENV === 'production') {
    throw new Error('🚫 Cannot reset database in production environment');
  }

  console.log('🔄 Resetting database using TRUNCATE CASCADE...');

  // Get all table names from the public schema
  const tables = await pool.query<TableNameRow>(`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name != 'drizzle_migrations'
    ORDER BY table_name;
  `);

  if (tables.rows.length === 0) return;

  const tableNames = tables.rows.map((row) => `"${row.tableName}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);

  console.log('✨ Database reset complete.');
}

export function logStep(message: string) {
  console.log(`\n📦 ${message}`);
}

export function logSuccess(message: string) {
  console.log(`✅ ${message}`);
}
