import type {
  AvailabilityId,
  ChurchId,
  EventId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { AvailabilityProps } from '../../domain/entities/availability';
import { Availability } from '../../domain/entities/availability';
import { assertEnum } from './mapper-utils';

const AVAILABILITY_TYPES = ['available', 'unavailable'] as const;

export function mapAvailability(row: {
  id: string;
  churchId: string;
  volunteerId: string;
  eventId: string | null;
  type: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason: string | null;
  repeatRule: string | null;
}): Availability {
  const props: AvailabilityProps = {
    churchId: row.churchId as ChurchId,
    volunteerId: row.volunteerId as VolunteerId,
    eventId: (row.eventId ?? undefined) as EventId | undefined,
    type: assertEnum({
      field: 'type',
      value: row.type,
      valid: AVAILABILITY_TYPES,
    }),
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    reason: row.reason ?? undefined,
    repeatRule: row.repeatRule ?? undefined,
  };

  return new Availability(props, row.id as AvailabilityId);
}
