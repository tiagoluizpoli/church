import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleCycleRepositoryInput {
  db: AnyDrizzleDb;
}
