import type { shiftRequirement } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type ShiftRequirementRow = InferSelectModel<typeof shiftRequirement>;

export interface MapShiftRequirementInput {
  row: ShiftRequirementRow;
  eventTimeBlockId?: string;
  /** The joined Sector's name. */
  sectorName: string;
}
