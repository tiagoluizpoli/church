import type { eventTimeBlock } from '@church/db';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleEventTimeBlockRepositoryInput {
  db: AnyDrizzleDb;
}

export interface FetchWithRequirementsInput {
  db: AnyDrizzleDb;
  eventTimeBlockRow: typeof eventTimeBlock.$inferSelect;
}
