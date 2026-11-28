import { churchAddress } from '@church/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { PlaceAddressNotFoundError } from '../../domain/errors/place-address-not-found';
import type { AnyDrizzleDb } from './drizzle-db.types';
import { DrizzleTransactionContext } from './drizzle-transaction-context';
import type {
  AssertPlaceAddressesInput,
  ChurchScopedTable,
  ContainsPatternInput,
  GetClientInput,
  WithChurchIsolationInput,
} from './helpers.types';

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

/** ILIKE pattern matching the value literally anywhere: `%`, `_` and `\` are escaped. */
export function containsPattern({ value }: ContainsPatternInput): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

/** Refuses a time-block place naming an address another Church (or nobody) has. */
export async function assertPlaceAddresses({
  db,
  churchId,
  addressIds,
}: AssertPlaceAddressesInput): Promise<void> {
  const ids = [...new Set(addressIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  // list-order: only the number of addresses found is compared
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
