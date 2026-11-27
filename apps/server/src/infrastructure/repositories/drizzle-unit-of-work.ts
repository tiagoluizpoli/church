import type {
  RunTransactionInput,
  TransactionWork,
  UnitOfWork,
} from '../../domain/contracts/infrastructure/unit-of-work';
import type { AnyDrizzleDb } from './drizzle-db.types';
import {
  asTxContext,
  DrizzleTransactionContext,
} from './drizzle-transaction-context';
import type { DrizzleUnitOfWorkInput } from './drizzle-unit-of-work.types';

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor({ db }: DrizzleUnitOfWorkInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async run<T>(work: TransactionWork<T>): Promise<T> {
    return this.runWith({ work });
  }

  async runWith<T>({ work, ...options }: RunTransactionInput<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const ctx = new DrizzleTransactionContext({ tx });
      return work(asTxContext(ctx));
    }, options);
  }
}
