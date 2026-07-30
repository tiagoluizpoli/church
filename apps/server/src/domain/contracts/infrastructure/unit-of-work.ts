import type { TransactionContext } from './transaction-context';

export type TransactionIsolationLevel =
  | 'read uncommitted'
  | 'read committed'
  | 'repeatable read'
  | 'serializable';

export interface RunTransactionOptions {
  isolationLevel?: TransactionIsolationLevel;
}

export interface UnitOfWork {
  run<T>(
    fn: (tx: TransactionContext) => Promise<T>,
    options?: RunTransactionOptions,
  ): Promise<T>;
}
