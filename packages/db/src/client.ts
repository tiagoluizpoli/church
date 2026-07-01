import { env } from '@church/env/server';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { getTestDatabaseUrl } from './test-database-url';

export function createDb() {
  const connectionString =
    process.env.NODE_ENV === 'test' ? getTestDatabaseUrl() : env.DATABASE_URL;
  const pool = new pg.Pool({
    connectionString,
    max: process.env.NODE_ENV === 'test' ? 2 : 10,
  });
  return drizzle(pool, { schema });
}

export const db = createDb();
