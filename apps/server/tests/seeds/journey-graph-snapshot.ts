import { verifyPassword } from 'better-auth/crypto';
import { SEED_PERSONA_PASSWORD } from '../../seeds/blueprints/credentials';
import { testDb } from '../integration/repositories/setup';

type CountRow = { value: string };

type PublicTableRow = { tablename: string };

/** Columns the clock stamps, which a rebuild legitimately changes. */
const CLOCK_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'assigned_at',
  'expires_at',
  'joined_at',
]);

export async function publicTables(): Promise<string[]> {
  const result = await testDb.execute<PublicTableRow>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return result.rows.map((row) => row.tablename);
}

export type TableCounts = Record<string, number>;

export async function countAllRows(): Promise<TableCounts> {
  const counts: TableCounts = {};
  for (const table of await publicTables()) {
    const result = await testDb.execute<CountRow>(
      `select count(*)::text as value from "${table}"`,
    );
    counts[table] = Number(result.rows[0]?.value ?? 0);
  }
  return counts;
}

export type GraphSnapshot = Record<string, string[]>;

/**
 * Every row of every table minus clock-stamped columns. Credential hashes are
 * salted, so each is compared by whether it still verifies the persona
 * password instead.
 */
export async function snapshotAllRows(): Promise<GraphSnapshot> {
  const snapshot: GraphSnapshot = {};
  for (const table of await publicTables()) {
    const result = await testDb.execute<Record<string, unknown>>(
      `select * from "${table}"`,
    );
    if (result.rows.length === 0) continue;
    const rows: string[] = [];
    for (const row of result.rows) {
      const kept: Record<string, unknown> = {};
      for (const [column, value] of Object.entries(row)) {
        if (CLOCK_COLUMNS.has(column)) continue;
        kept[column] =
          table === 'account' && column === 'password'
            ? await verifyPassword({
                hash: String(value),
                password: SEED_PERSONA_PASSWORD,
              })
            : value;
      }
      rows.push(JSON.stringify(kept));
    }
    snapshot[table] = rows.sort();
  }
  return snapshot;
}

export interface TableRowsInput {
  snapshot: GraphSnapshot;
}

export interface RowsMentioningInput extends TableRowsInput {
  ids: readonly string[];
}

/** The rows of a snapshot that mention any of the given ids. */
export function rowsMentioning({
  snapshot,
  ids,
}: RowsMentioningInput): GraphSnapshot {
  const found: GraphSnapshot = {};
  for (const [table, rows] of Object.entries(snapshot)) {
    const matching = rows.filter((row) => ids.some((id) => row.includes(id)));
    if (matching.length > 0) found[table] = matching;
  }
  return found;
}
