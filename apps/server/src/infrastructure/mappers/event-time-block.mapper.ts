import type { eventTimeBlock } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { EventTimeBlockProps } from '../../domain/entities/event-time-block';
import { EventTimeBlock } from '../../domain/entities/event-time-block';
import type { ShiftRequirement } from '../../domain/entities/shift-requirement';

type EventTimeBlockRow = InferSelectModel<typeof eventTimeBlock>;

export function mapEventTimeBlock(
  row: EventTimeBlockRow,
  requirements: ShiftRequirement[] = [],
): EventTimeBlock {
  const props: EventTimeBlockProps = {
    churchId: row.churchId as ChurchId,
    eventId: row.eventId as EventId,
    sourceTemplateTimeBlockId:
      (row.sourceTemplateTimeBlockId as TemplateTimeBlockId | null) ??
      undefined,
    startTime: fromDate({ date: row.startTime }),
    endTime: fromDate({ date: row.endTime }),
    label: row.label ?? undefined,
    status: 'active',
    requirements,
  };

  return new EventTimeBlock(
    props,
    row.id as EventTimeBlockId,
    row.createdAt,
    row.createdAt,
  );
}
