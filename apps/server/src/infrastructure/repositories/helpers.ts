import { churchAddress } from '@church/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import { PlaceAddressNotFoundError } from '../../domain/errors/place-address-not-found';
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

export interface ContainsPatternInput {
  value: string;
}

/** ILIKE pattern matching the value literally anywhere: `%`, `_` and `\` are escaped. */
export function containsPattern({ value }: ContainsPatternInput): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export interface AssertPlaceAddressesInput {
  db: AnyDrizzleDb;
  churchId: string;
  addressIds: readonly (string | null | undefined)[];
}

/** Refuses a time-block place naming an address another Church (or nobody) has. */
export async function assertPlaceAddresses({
  db,
  churchId,
  addressIds,
}: AssertPlaceAddressesInput): Promise<void> {
  const ids = [...new Set(addressIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const found = await db
    .select({ id: churchAddress.id })
    .from(churchAddress)
    .where(
      and(
        withChurchIsolation({ table: churchAddress, churchId }),
        inArray(churchAddress.id, ids),
      ),
    );
  if (found.length !== ids.length) throw new PlaceAddressNotFoundError();
}
