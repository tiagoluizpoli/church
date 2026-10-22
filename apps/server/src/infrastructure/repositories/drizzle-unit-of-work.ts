import type {
  RunTransactionInput,
  TransactionWork,
  UnitOfWork,
} from '../../domain/contracts/infrastructure/unit-of-work';
import {
  asTxContext,
  DrizzleTransactionContext,
} from './drizzle-transaction-context';
import type { AnyDrizzleDb } from './types';

interface DrizzleUnitOfWorkInput {
  db: AnyDrizzleDb;
}

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
