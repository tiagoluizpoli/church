import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { AnyDrizzleDb } from './drizzle-db.types';

// biome-ignore lint/suspicious/noExplicitAny: table shape is intentionally loose
export type ChurchScopedTable = { churchId: any };

export interface WithChurchIsolationInput<T extends ChurchScopedTable> {
  table: T;
  churchId: string;
}

export interface GetClientInput {
  db: AnyDrizzleDb;
  tx?: TransactionContext;
}

export interface ContainsPatternInput {
  value: string;
}

export interface AssertPlaceAddressesInput {
  db: AnyDrizzleDb;
  churchId: string;
  addressIds: readonly (string | null | undefined)[];
}
