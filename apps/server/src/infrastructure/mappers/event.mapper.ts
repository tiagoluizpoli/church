import type { event } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, EventId } from '../../domain/branded-ids';
import type { EventProps } from '../../domain/entities/event';
import { Event } from '../../domain/entities/event';

type EventRow = InferSelectModel<typeof event>;

export function mapEvent(row: EventRow): Event {
  const props: EventProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as EventProps['ministryId'],
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as EventProps['status'],
    eventType: row.eventType as EventProps['eventType'],
  };

  return new Event(props, row.id as EventId, row.createdAt, row.updatedAt);
}
