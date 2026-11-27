import { fromDate } from '@church/time';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { EventTimeBlockProps } from '../../domain/entities/event-time-block';
import { EventTimeBlock } from '../../domain/entities/event-time-block';
import type { MapEventTimeBlockInput } from './event-time-block.mapper.types';

export function mapEventTimeBlock({
  row,
  requirements = [],
}: MapEventTimeBlockInput): EventTimeBlock {
  const props: EventTimeBlockProps = {
    churchId: row.churchId as ChurchId,
    eventId: row.eventId as EventId,
    sourceTemplateTimeBlockId:
      (row.sourceTemplateTimeBlockId as TemplateTimeBlockId | null) ??
      undefined,
    startTime: fromDate({ date: row.startTime }),
    endTime: fromDate({ date: row.endTime }),
    label: row.label ?? undefined,
    isPublic: row.isPublic,
    place: row.place ?? undefined,
    placeAddressId: row.placeAddressId ?? undefined,
    status: row.status,
    isHidden: row.isHidden,
    requirements,
  };

  return new EventTimeBlock({
    props,
    id: row.id as EventTimeBlockId,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  });
}
