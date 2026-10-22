import { eq, isNull } from 'drizzle-orm';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import { DrizzleTransactionContext } from './drizzle-transaction-context';
import type { AnyDrizzleDb } from './types';

// biome-ignore lint/suspicious/noExplicitAny: table shape is intentionally loose
type ChurchScopedTable = { churchId: any };

export interface WithChurchIsolationInput<T extends ChurchScopedTable> {
  table: T;
  churchId: string;
}

export interface GetClientInput {
  db: AnyDrizzleDb;
  tx?: TransactionContext;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Returns the Drizzle SQL filter expression for church isolation.
 * Apply to every query as a WHERE clause condition.
 */
export function withChurchIsolation<T extends ChurchScopedTable>({
  table,
  churchId,
}: WithChurchIsolationInput<T>) {
  return eq(table.churchId, churchId);
}

/**
 * Returns the Drizzle SQL filter expression that excludes retired Volunteer
 * profiles. Apply to every volunteer-by-user read — a retired profile must
 * never resolve as someone's current Volunteer.
 */
// biome-ignore lint/suspicious/noExplicitAny: table shape is intentionally loose
export function withActiveVolunteer<T extends { leftAt: any }>(table: T) {
  return isNull(table.leftAt);
}

/**
 * Extracts the active Drizzle client from a transaction context if present,
 * otherwise returns the default db client.
 */
export function getClient({ db, tx }: GetClientInput): AnyDrizzleDb {
  if (tx instanceof DrizzleTransactionContext) {
    return tx.tx as AnyDrizzleDb;
  }
  return db;
}
