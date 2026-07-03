import type { ChurchId, EventTemplateId } from '../../branded-ids';
import type { EventTemplate } from '../../entities/event-template';

export interface EventTemplateBlockManagerInput {
  label: string;
  startTime: string;
  endTime: string;
  order: number;
}

export interface CreateEventTemplateManagerInput {
  churchId: ChurchId;
  name: string;
  weekday: number;
  blocks: EventTemplateBlockManagerInput[];
}

export interface UpdateEventTemplateManagerInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  name: string;
  weekday: number;
  blocks: EventTemplateBlockManagerInput[];
}

export interface DeleteEventTemplateManagerInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
}

export interface ListEventTemplatesManagerInput {
  churchId: ChurchId;
}

export interface IEventTemplateManager {
  createTemplate(
    input: CreateEventTemplateManagerInput,
  ): Promise<EventTemplate>;
  updateTemplate(
    input: UpdateEventTemplateManagerInput,
  ): Promise<EventTemplate>;
  deleteTemplate(input: DeleteEventTemplateManagerInput): Promise<void>;
  listTemplates(
    input: ListEventTemplatesManagerInput,
  ): Promise<EventTemplate[]>;
}
