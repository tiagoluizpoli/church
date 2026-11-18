import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';

export interface DrizzleTransactionContextInput {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle PgTransaction is a complex generic — any is intentional here
  tx: any;
}

export class DrizzleTransactionContext {
  readonly tx: DrizzleTransactionContextInput['tx'];

  constructor({ tx }: DrizzleTransactionContextInput) {
    this.tx = tx;
  }
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
