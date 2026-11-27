import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleShiftRepositoryInput {
  db: AnyDrizzleDb;
}
