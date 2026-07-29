import { member } from '@church/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { ChurchId, UserId } from '../../domain/branded-ids';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
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
export function getClient(
  db: AnyDrizzleDb,
  tx?: TransactionContext,
): AnyDrizzleDb {
  if (tx instanceof DrizzleTransactionContext) {
    return tx.tx as AnyDrizzleDb;
  }
  return db;
}

/**
 * Church-wide administration has no domain table of its own — it's read from
 * Better Auth's `member.role`, for the organization whose id equals the
 * Church id (a Church row shares its primary key with its `organization`
 * row). The one place this check lives; every repository needing it calls
 * this instead of re-querying `member` directly.
 */
export async function isChurchAdminMember(
  db: AnyDrizzleDb,
  churchId: ChurchId,
  userId: UserId,
  tx?: TransactionContext,
): Promise<boolean> {
  const [row] = await getClient(db, tx)
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, churchId),
        eq(member.userId, userId),
        eq(member.role, 'admin'),
      ),
    )
    .limit(1);
  return row != null;
}
