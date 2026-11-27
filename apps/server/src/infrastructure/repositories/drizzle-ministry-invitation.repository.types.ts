import type { AppConfig } from '@church/app-config';
import type { ministryInvitation } from '@church/db';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface ChurchAccessLevelOfInput {
  role: string | null;
}

export interface HydrateMinistryInvitationInput {
  row: typeof ministryInvitation.$inferSelect;
  tx?: TransactionContext;
}

export interface DrizzleMinistryInvitationRepositoryInput {
  db: AnyDrizzleDb;
  config: AppConfig;
}
