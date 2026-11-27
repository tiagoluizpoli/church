import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleEventRepositoryInput {
  db: AnyDrizzleDb;
}
