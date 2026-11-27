import type { AnyDrizzleDb } from '../repositories/drizzle-db.types';

export interface DrizzleSchedulingScopeResolverInput {
  db: AnyDrizzleDb;
}
