import type { availability } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AvailabilityId,
  AvailabilityProps,
} from '../../domain/entities/availability';
import { Availability } from '../../domain/entities/availability';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { VolunteerId } from '../../domain/entities/volunteer';

type AvailabilityRow = InferSelectModel<typeof availability>;

export function mapAvailability(row: AvailabilityRow): Availability {
  const props: AvailabilityProps = {
    churchId: row.churchId as ChurchId,
    volunteerId: row.volunteerId as VolunteerId,
    eventId: (row.eventId ?? undefined) as EventId | undefined,
    type: row.type as AvailabilityProps['type'],
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    reason: row.reason ?? undefined,
    repeatRule: row.repeatRule ?? undefined,
  };

  return new Availability(props, row.id as AvailabilityId);
}
