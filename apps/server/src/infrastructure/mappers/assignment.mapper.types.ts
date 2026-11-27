import type { assignment } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type AssignmentRow = InferSelectModel<typeof assignment>;

export interface MapAssignmentInput {
  row: AssignmentRow;
  eventTimeBlockId?: string;
}
