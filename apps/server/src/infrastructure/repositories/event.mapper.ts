import type { ChurchId, EventId } from '../../domain/branded-ids';
import type { EventProps } from '../../domain/entities/event';
import { Event } from '../../domain/entities/event';
import { assertEnum } from './mapper-utils';

const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'past'] as const;
const EVENT_TYPES = ['hourly', 'day_based'] as const;

export function mapEvent(row: {
  id: string;
  churchId: string;
  ministryId: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  eventType: string;
  createdAt: Date;
  updatedAt: Date;
}): Event {
  const props: EventProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as EventProps['ministryId'],
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    startDate: row.startDate,
    endDate: row.endDate,
    status: assertEnum({
      field: 'status',
      value: row.status,
      valid: EVENT_STATUSES,
    }),
    eventType: assertEnum({
      field: 'eventType',
      value: row.eventType,
      valid: EVENT_TYPES,
    }),
  };

  return new Event(props, row.id as EventId, row.createdAt, row.updatedAt);
}
