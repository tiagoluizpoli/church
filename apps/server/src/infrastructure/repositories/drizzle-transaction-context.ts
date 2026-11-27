import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  DrizzleTransactionContextInput,
  IDrizzleTransactionContext,
} from './drizzle-transaction-context.types';

export class DrizzleTransactionContext implements IDrizzleTransactionContext {
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
