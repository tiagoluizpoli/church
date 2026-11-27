import type { ChurchId } from '../../domain/branded-ids';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface NeedsReviewConditionInput {
  client: AnyDrizzleDb;
  churchId: ChurchId;
}
