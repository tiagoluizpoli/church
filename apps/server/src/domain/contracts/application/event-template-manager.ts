import type { ChurchId, EventTemplateId } from '../../branded-ids';
import type {
  EventTemplate,
  EventTemplateUsage,
} from '../../entities/event-template';

/** Submitted block; `order` is derived from start time by the manager. */
export interface EventTemplateTimeBlockManagerInput {
  /** Persisted id on edit: update that block in place; absent creates one. */
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
}

export interface CreateEventTemplateManagerInput {
  churchId: ChurchId;
  name: string;
  weekday: number;
  blocks: EventTemplateTimeBlockManagerInput[];
}

export interface UpdateEventTemplateManagerInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  name: string;
  weekday: number;
  blocks: EventTemplateTimeBlockManagerInput[];
}

export interface DeleteEventTemplateManagerInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
}

export interface GetEventTemplateManagerInput {
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
  getTemplate(input: GetEventTemplateManagerInput): Promise<EventTemplate>;
  getTemplateUsage(
    input: GetEventTemplateManagerInput,
  ): Promise<EventTemplateUsage>;
  listTemplates(
    input: ListEventTemplatesManagerInput,
  ): Promise<EventTemplate[]>;
}
