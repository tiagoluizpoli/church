import type { SQL } from 'drizzle-orm';
import type { ChurchId, VolunteerId } from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleAssignmentRepositoryInput {
  db: AnyDrizzleDb;
}

export interface ListRangeInput {
  churchId: ChurchId;
  timeCondition: SQL;
  volunteerId?: VolunteerId;
  tx?: TransactionContext;
}

export interface RowsInput {
  churchId: ChurchId;
  conditions: SQL[];
  leadingOrder?: SQL[];
  tx?: TransactionContext;
}
