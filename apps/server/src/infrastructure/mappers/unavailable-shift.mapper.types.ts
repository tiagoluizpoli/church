import type { unavailableShift } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type UnavailableShiftRow = InferSelectModel<typeof unavailableShift>;

export interface AvailabilityJoinedRow {
  volunteerId: string;
  shiftStartTime: Date;
  shiftEndTime: Date;
}

export interface MapUnavailableShiftInput {
  row: UnavailableShiftRow;
  joined: AvailabilityJoinedRow;
}
