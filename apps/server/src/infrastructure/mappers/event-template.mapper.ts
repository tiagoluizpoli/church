import { fromTimeColumn } from '@church/time';
import type {
  ChurchId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { EventTemplateProps } from '../../domain/entities/event-template';
import { EventTemplate } from '../../domain/entities/event-template';
import type { TemplateTimeBlockProps } from '../../domain/entities/template-time-block';
import { TemplateTimeBlock } from '../../domain/entities/template-time-block';
import type { Recurrence } from '../../domain/recurrence';
import type {
  MapEventTemplateInput,
  TemplateTimeBlockRow,
} from './event-template.mapper.types';

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
    isPublic: row.isPublic,
    place: row.place ?? undefined,
    placeAddressId: row.placeAddressId ?? undefined,
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
    // The entity validates the stored shape.
    recurrence: template.recurrence as Recurrence,
    blocks: blocks.map(mapTemplateTimeBlock),
  };

  return new EventTemplate({
    props,
    id: template.id as EventTemplateId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
}
