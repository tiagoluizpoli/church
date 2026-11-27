import type { AnyDrizzleDb } from './drizzle-db.types';

export interface RefuseNameInUseInput<T> {
  write: Promise<T>;
}

export interface DrizzleRoleRepositoryInput {
  db: AnyDrizzleDb;
}

export interface ActiveInMinistryInput {
  churchId: string;
  ministryId: string;
}
