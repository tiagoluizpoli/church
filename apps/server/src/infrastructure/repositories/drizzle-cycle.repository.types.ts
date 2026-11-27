import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleCycleRepositoryInput {
  db: AnyDrizzleDb;
}
