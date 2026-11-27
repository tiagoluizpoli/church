import type { eventTimeBlock } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ShiftRequirement } from '../../domain/entities/shift-requirement';

export type EventTimeBlockRow = InferSelectModel<typeof eventTimeBlock>;

export interface MapEventTimeBlockInput {
  row: EventTimeBlockRow;
  requirements?: ShiftRequirement[];
}
