import { env } from '@church/env/server';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getE2eDatabaseUrl } from './e2e-database-url';
import { getIntegrationDatabaseUrl } from './integration-database-url';
import * as schema from './schema';

function resolveConnectionString(): string {
  if (process.env.CHURCH_EXEC_PURPOSE === 'integration') {
    return getIntegrationDatabaseUrl();
  }

  if (process.env.CHURCH_EXEC_PURPOSE === 'e2e') {
    return getE2eDatabaseUrl();
  }

  // Development and production: the target Varlock (or the deployment)
  // injected. `NODE_ENV` never selects a database (ADR-0005).
  return env.DATABASE_URL;
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
