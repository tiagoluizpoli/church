import type { volunteer } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type VolunteerRow = InferSelectModel<typeof volunteer>;

export interface MapVolunteerInput {
  row: VolunteerRow;
  name?: string | null;
}
