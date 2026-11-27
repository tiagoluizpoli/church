import type { AnyDrizzleDb } from './drizzle-db.types';

export interface RefuseNameInUseInput<T> {
  write: Promise<T>;
}

export interface ActiveSectorInput {
  churchId: string;
  ministryId: string;
  sectorId: string;
}

export interface DrizzleSectorRepositoryInput {
  db: AnyDrizzleDb;
}
