import type { SQL } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';
import type { ListActiveMembershipsInput } from '../../domain/contracts/infrastructure/availability-check.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface DrizzleAvailabilityCheckRepositoryInput {
  db: AnyDrizzleDb;
}

export interface SelectActiveMembershipsInput
  extends ListActiveMembershipsInput {
  filter?: SQL;
}

export interface ShareLockMembershipsInput<Query extends PgSelect> {
  query: Query;
  tx?: TransactionContext;
}
