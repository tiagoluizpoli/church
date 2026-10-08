import pg from 'pg';
import { getE2eDatabaseUrl } from './e2e-database-url';

interface PublicTableRow {
  tablename: string;
}

/**
 * Empties every table of this worktree's E2E database, so each run starts
 * from nothing: the suite's shared personas, every journey graph, and
 * whatever an aborted run left behind. `getE2eDatabaseUrl` refuses any
 * target but the E2E database before a pool exists. Migration history lives
 * in the `drizzle` schema and is untouched.
 */
export async function resetE2eDatabase(): Promise<void> {
  const pool = new pg.Pool({ connectionString: getE2eDatabaseUrl(), max: 1 });
  try {
    const tables = await pool.query<PublicTableRow>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (tables.rows.length === 0) return;

    const tableList = tables.rows
      .map((row) => pg.escapeIdentifier(row.tablename))
      .join(', ');
    await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}
