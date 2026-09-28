import { env } from '@church/env/server';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getIntegrationDatabaseUrl } from './integration-database-url';
import * as schema from './schema';
import { getTestDatabaseUrl } from './test-database-url';

function resolveConnectionString(): string {
  if (process.env.CHURCH_EXEC_PURPOSE === 'integration') {
    return getIntegrationDatabaseUrl();
  }

  // Legacy path, still relied on by unmigrated runners (ADR-0005).
  return process.env.NODE_ENV === 'test'
    ? getTestDatabaseUrl()
    : env.DATABASE_URL;
}

export function createDb() {
  const connectionString = resolveConnectionString();
  const pool = new pg.Pool({
    connectionString,
    max: process.env.NODE_ENV === 'test' ? 2 : 10,
  });
  return drizzle(pool, { schema });
}

export const db = createDb();
