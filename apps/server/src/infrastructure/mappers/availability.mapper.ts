import type { availability } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AvailabilityCheckId,
  AvailabilityId,
  ChurchId,
  EventId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { AvailabilityProps } from '../../domain/entities/availability';
import { Availability } from '../../domain/entities/availability';

type AvailabilityRow = InferSelectModel<typeof availability>;

interface AvailabilityJoinedRow {
  volunteerId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
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
    eventId: joined.eventId as EventId,
    type: 'unavailable',
    startTime: joined.startTime,
    endTime: joined.endTime,
    isAllDay: false,
  };

  return new Availability(props, row.id as AvailabilityId);
}
