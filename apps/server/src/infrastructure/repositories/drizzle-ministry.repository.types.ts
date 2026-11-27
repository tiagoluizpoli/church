import type { AnyDrizzleDb } from './drizzle-db.types';

export interface RefuseNameInUseInput<T> {
  write: Promise<T>;
}

export interface DrizzleMinistryRepositoryInput {
  db: AnyDrizzleDb;
}
