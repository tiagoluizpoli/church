import type { availability } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AvailabilityCheckId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { AvailabilityProps } from '../../domain/entities/availability';
import { Availability } from '../../domain/entities/availability';

type AvailabilityRow = InferSelectModel<typeof availability>;

export interface AvailabilityJoinedRow {
  volunteerId: string;
  shiftStartTime: Date;
  shiftEndTime: Date;
}

export function mapAvailability(
  row: AvailabilityRow,
  joined: AvailabilityJoinedRow,
): Availability {
  const props: AvailabilityProps = {
    churchId: row.churchId as ChurchId,
    availabilityCheckId: row.availabilityCheckId as AvailabilityCheckId,
    shiftId: row.shiftId as ShiftId,
    volunteerId: joined.volunteerId as VolunteerId,
    shiftStartTime: joined.shiftStartTime,
    shiftEndTime: joined.shiftEndTime,
  };

  return new Availability({
    props,
    id: row.id,
    createdAt: row.createdAt,
  });
}
