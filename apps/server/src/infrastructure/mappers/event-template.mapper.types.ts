import type { eventTemplate, templateTimeBlock } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type EventTemplateRow = InferSelectModel<typeof eventTemplate>;

export type TemplateTimeBlockRow = InferSelectModel<typeof templateTimeBlock>;

export interface MapEventTemplateInput {
  template: EventTemplateRow;
  blocks: TemplateTimeBlockRow[];
}
