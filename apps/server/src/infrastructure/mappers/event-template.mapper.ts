import type { eventTemplate, timeBlock } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventTemplateId,
  TimeBlockId,
} from '../../domain/branded-ids';
import type { EventTemplateProps } from '../../domain/entities/event-template';
import { EventTemplate } from '../../domain/entities/event-template';
import type { TimeBlockProps } from '../../domain/entities/time-block';
import { TimeBlock } from '../../domain/entities/time-block';

type EventTemplateRow = InferSelectModel<typeof eventTemplate>;
type TimeBlockRow = InferSelectModel<typeof timeBlock>;

interface MapEventTemplateInput {
  template: EventTemplateRow;
  blocks: TimeBlockRow[];
}

export function mapTimeBlock(row: TimeBlockRow): TimeBlock {
  const props: TimeBlockProps = {
    churchId: row.churchId as ChurchId,
    templateId: row.templateId as EventTemplateId,
    label: row.label,
    startTime: row.startTime,
    endTime: row.endTime,
    order: row.order,
  };

  return new TimeBlock({
    props,
    id: row.id as TimeBlockId,
  });
}

export function mapEventTemplate({
  template,
  blocks,
}: MapEventTemplateInput): EventTemplate {
  const props: EventTemplateProps = {
    churchId: template.churchId as ChurchId,
    name: template.name,
    weekday: template.weekday,
    blocks: blocks.map(mapTimeBlock),
  };

  return new EventTemplate({
    props,
    id: template.id as EventTemplateId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
}
