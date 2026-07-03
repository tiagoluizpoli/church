import type { ChurchId, EventTemplateId } from '../../branded-ids';
import type { EventTemplate } from '../../entities/event-template';
import type { TransactionContext } from './transaction-context';

export interface EventTemplateBlockInput {
  label: string;
  startTime: string;
  endTime: string;
  order: number;
}

export interface CreateEventTemplateInput {
  churchId: ChurchId;
  name: string;
  weekday: number;
  blocks: EventTemplateBlockInput[];
  tx?: TransactionContext;
}

export interface UpdateEventTemplateInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  name: string;
  weekday: number;
  blocks: EventTemplateBlockInput[];
  tx?: TransactionContext;
}

export interface DeleteEventTemplateInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  tx?: TransactionContext;
}

export interface ListEventTemplatesInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface GetEventTemplateInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  tx?: TransactionContext;
}

export interface GetEventTemplatesByIdsInput {
  churchId: ChurchId;
  templateIds: EventTemplateId[];
  tx?: TransactionContext;
}

export interface EventTemplateRepository {
  create(input: CreateEventTemplateInput): Promise<EventTemplate>;
  update(input: UpdateEventTemplateInput): Promise<EventTemplate>;
  delete(input: DeleteEventTemplateInput): Promise<void>;
  list(input: ListEventTemplatesInput): Promise<EventTemplate[]>;
  getById(input: GetEventTemplateInput): Promise<EventTemplate>;
  getByIds(input: GetEventTemplatesByIdsInput): Promise<EventTemplate[]>;
}
