import type { event } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, EventId } from '../../domain/branded-ids';
import type { EventProps } from '../../domain/entities/event';
import { Event } from '../../domain/entities/event';

type EventRow = InferSelectModel<typeof event>;

export function mapEvent(row: EventRow): Event {
  const props: EventProps = {
    churchId: row.churchId as ChurchId,
    cycleId: row.cycleId as EventProps['cycleId'],
    sourceTemplateId:
      (row.sourceTemplateId as EventProps['sourceTemplateId']) ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    start: fromDate({ date: row.start }),
    end: fromDate({ date: row.end }),
    status: row.status as EventProps['status'],
  };

  return new Event({
    props,
    id: row.id as EventId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
