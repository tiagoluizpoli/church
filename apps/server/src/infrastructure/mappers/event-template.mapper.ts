import type { eventTemplate, templateTimeBlock } from '@church/db';
import { fromTimeColumn } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { EventTemplateProps } from '../../domain/entities/event-template';
import { EventTemplate } from '../../domain/entities/event-template';
import type { TemplateTimeBlockProps } from '../../domain/entities/template-time-block';
import { TemplateTimeBlock } from '../../domain/entities/template-time-block';

type EventTemplateRow = InferSelectModel<typeof eventTemplate>;
type TemplateTimeBlockRow = InferSelectModel<typeof templateTimeBlock>;

interface MapEventTemplateInput {
  template: EventTemplateRow;
  blocks: TemplateTimeBlockRow[];
}

export function mapTemplateTimeBlock(
  row: TemplateTimeBlockRow,
): TemplateTimeBlock {
  const props: TemplateTimeBlockProps = {
    churchId: row.churchId as ChurchId,
    templateId: row.templateId as EventTemplateId,
    label: row.label,
    startTime: fromTimeColumn({ value: row.startTime }),
    endTime: fromTimeColumn({ value: row.endTime }),
    order: row.order,
  };

  return new TemplateTimeBlock({
    props,
    id: row.id as TemplateTimeBlockId,
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
    blocks: blocks.map(mapTemplateTimeBlock),
  };

  return new EventTemplate({
    props,
    id: template.id as EventTemplateId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
}
