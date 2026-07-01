import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../application/contracts/transaction-context';
import { DrizzleTransactionContext } from './drizzle-transaction-context';
import type { AnyDrizzleDb } from './types';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Returns the Drizzle SQL filter expression for church isolation.
 * Apply to every query as a WHERE clause condition.
 */
// biome-ignore lint/suspicious/noExplicitAny: table shape is intentionally loose
export function withChurchIsolation<T extends { churchId: any }>(
  table: T,
  churchId: string,
) {
  return eq(table.churchId, churchId);
}

/**
 * Extracts the active Drizzle client from a transaction context if present,
 * otherwise returns the default db client.
 */
export function getClient(
  db: AnyDrizzleDb,
  tx?: TransactionContext,
): AnyDrizzleDb {
  if (tx instanceof DrizzleTransactionContext) {
    return tx.tx as AnyDrizzleDb;
  }
  return db;
}
