import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleUsualSetupRepositoryInput {
  db: AnyDrizzleDb;
}
