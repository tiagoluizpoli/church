import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../../domain/contracts/infrastructure/unit-of-work';
import {
  asTxContext,
  DrizzleTransactionContext,
} from './drizzle-transaction-context';
import type { AnyDrizzleDb } from './types';

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: AnyDrizzleDb) {}

  async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const ctx = new DrizzleTransactionContext(tx);
      return fn(asTxContext(ctx));
    });
  }
}
