import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';

export class DrizzleTransactionContext {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle PgTransaction is a complex generic — any is intentional here
  constructor(public readonly tx: any) {}
}

/**
 * Cast a DrizzleTransactionContext to the opaque TransactionContext brand.
 * Used by DrizzleUnitOfWork when invoking the user callback.
 */
export function asTxContext(
  ctx: DrizzleTransactionContext,
): TransactionContext {
  return ctx as unknown as TransactionContext;
}
