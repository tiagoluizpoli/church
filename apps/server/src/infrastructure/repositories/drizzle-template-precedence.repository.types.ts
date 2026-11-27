import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleTemplatePrecedenceRepositoryInput {
  db: AnyDrizzleDb;
}
