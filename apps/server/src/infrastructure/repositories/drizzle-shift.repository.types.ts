import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleShiftRepositoryInput {
  db: AnyDrizzleDb;
}
