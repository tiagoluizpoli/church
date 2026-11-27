import type { outboxMessage } from '@church/db';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface DrizzleOutboxRepositoryInput {
  db: AnyDrizzleDb;
}

export type OutboxMessageRow = typeof outboxMessage.$inferSelect;
