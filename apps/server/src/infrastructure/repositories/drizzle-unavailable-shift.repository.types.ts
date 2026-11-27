import type { SQL } from 'drizzle-orm';
import type { ChurchId } from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleUnavailableShiftRepositoryInput {
  db: AnyDrizzleDb;
}

export interface RowsInput {
  churchId: ChurchId;
  conditions: SQL[];
  tx?: TransactionContext;
}
