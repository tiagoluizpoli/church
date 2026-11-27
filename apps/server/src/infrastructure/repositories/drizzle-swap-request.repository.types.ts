import type { swapRequest } from '@church/db';
import type { SQL } from 'drizzle-orm';
import type { ChurchId } from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface CloseOpenWhereInput {
  churchId: ChurchId;
  match: SQL;
  values: Pick<
    typeof swapRequest.$inferInsert,
    'status' | 'closedBy' | 'reply'
  >;
  tx?: TransactionContext;
}

export interface DrizzleSwapRequestRepositoryInput {
  db: AnyDrizzleDb;
}
