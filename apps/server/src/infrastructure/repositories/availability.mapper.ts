import type {
  AvailabilityId,
  AvailabilityProps,
} from '../../domain/entities/availability';
import { Availability } from '../../domain/entities/availability';
import type { ChurchId } from '../../domain/entities/church';
import type { VolunteerId } from '../../domain/entities/volunteer';
import { assertEnum } from './mapper-utils';

const AVAILABILITY_TYPES = ['available', 'unavailable'] as const;

export function mapAvailability(row: {
  id: string;
  churchId: string;
  volunteerId: string;
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
