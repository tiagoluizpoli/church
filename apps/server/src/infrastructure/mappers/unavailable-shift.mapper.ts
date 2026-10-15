import type { availability } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AvailabilityCheckId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { UnavailableShiftProps } from '../../domain/entities/unavailable-shift';
import { Availability } from '../../domain/entities/unavailable-shift';

type AvailabilityRow = InferSelectModel<typeof availability>;

export interface AvailabilityJoinedRow {
  volunteerId: string;
  shiftStartTime: Date;
  shiftEndTime: Date;
}

export function mapUnavailableShift(
  row: AvailabilityRow,
  joined: AvailabilityJoinedRow,
): Availability {
  const props: UnavailableShiftProps = {
    churchId: row.churchId as ChurchId,
    availabilityCheckId: row.availabilityCheckId as AvailabilityCheckId,
    shiftId: row.shiftId as ShiftId,
    volunteerId: joined.volunteerId as VolunteerId,
    shiftStartTime: fromDate({ date: joined.shiftStartTime }),
    shiftEndTime: fromDate({ date: joined.shiftEndTime }),
  };

  return new Availability({
    props,
    id: row.id,
    createdAt: row.createdAt,
  });
}
