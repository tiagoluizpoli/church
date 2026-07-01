import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { getTestDatabaseUrl } from './test-database-url';

function getAdminDatabaseUrl(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  parsedUrl.pathname = '/postgres';
  return parsedUrl.toString();
}

function getDatabaseName(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  return parsedUrl.pathname.replace(/^\//, '');
}

async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  const adminPool = new pg.Pool({
    connectionString: getAdminDatabaseUrl(databaseUrl),
    max: 1,
  });

  try {
    const databaseName = getDatabaseName(databaseUrl);
    const existingDatabase = await adminPool.query(
      'select 1 from pg_database where datname = $1',
      [databaseName],
    );

    if (existingDatabase.rowCount && existingDatabase.rowCount > 0) {
      return;
    }

    await adminPool.query(`create database "${databaseName}"`);
  } finally {
    await adminPool.end();
  }
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const db = drizzle(pool);
    const migrationsFolder = join(
      dirname(fileURLToPath(import.meta.url)),
      'migrations',
    );

    await migrate(db, {
      migrationsFolder,
    });
  } finally {
    await pool.end();
  }
}

export async function setupTestDatabase(): Promise<void> {
  const testDatabaseUrl = getTestDatabaseUrl();

  await ensureDatabaseExists(testDatabaseUrl);
  await migrateDatabase(testDatabaseUrl);
}

if (import.meta.main) {
  setupTestDatabase()
    .then(() => {
      console.log('Test database is ready.');
    })
    .catch((error) => {
      console.error('Failed to set up test database.');
      console.error(error);
      process.exitCode = 1;
    });
}
