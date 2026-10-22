import type { TransactionContext } from './transaction-context';

export type TransactionIsolationLevel =
  | 'read uncommitted'
  | 'read committed'
  | 'repeatable read'
  | 'serializable';

export interface RunTransactionOptions {
  isolationLevel?: TransactionIsolationLevel;
}

export type TransactionWork<T> = (tx: TransactionContext) => Promise<T>;

export interface RunTransactionInput<T> extends RunTransactionOptions {
  work: TransactionWork<T>;
}

export interface UnitOfWork {
  run<T>(work: TransactionWork<T>): Promise<T>;
  runWith<T>(input: RunTransactionInput<T>): Promise<T>;
}
