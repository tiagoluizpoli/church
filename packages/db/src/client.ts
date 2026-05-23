import { env } from '@church/env/server';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export function createDb() {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: process.env.NODE_ENV === 'test' ? 2 : 10,
  });
  return drizzle(pool, { schema });
}

export const db = createDb();
