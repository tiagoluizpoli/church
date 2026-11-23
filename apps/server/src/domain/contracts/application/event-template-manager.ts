import type { ChurchId, EventTemplateId } from '../../branded-ids';
import type {
  EventTemplate,
  EventTemplateUsage,
} from '../../entities/event-template';
import type { Recurrence } from '../../recurrence';
import type {
  PrecedenceAnswer,
  TemplatePrecedenceAnswer,
} from '../../template-precedence';

/** Submitted block; `order` is derived from start time by the manager. */
export interface EventTemplateTimeBlockManagerInput {
  /** Persisted id on edit: update that block in place; absent creates one. */
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  isPublic?: boolean;
  place?: string;
  placeAddressId?: string | null;
}

export interface CreateEventTemplateManagerInput {
  churchId: ChurchId;
  name: string;
  recurrence: Recurrence;
  blocks: EventTemplateTimeBlockManagerInput[];
  /** Answers for colliding pairs; an unanswered new collision refuses the save. */
  precedences?: TemplatePrecedenceAnswer[];
}

export interface UpdateEventTemplateManagerInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  name: string;
  recurrence: Recurrence;
  blocks: EventTemplateTimeBlockManagerInput[];
  /** Answers for colliding pairs; an unanswered new collision refuses the save. */
  precedences?: TemplatePrecedenceAnswer[];
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

export interface ChangeTemplatePrecedenceManagerInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  otherTemplateId: EventTemplateId;
  answer: PrecedenceAnswer;
}

/** A stored Template Precedence as one template of the pair sees it. */
export interface TemplatePrecedenceView extends TemplatePrecedenceAnswer {
  otherTemplateName: string;
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
  /** The template's stored precedences, ordered by the other template's name. */
  listPrecedences(
    input: GetEventTemplateManagerInput,
  ): Promise<TemplatePrecedenceView[]>;
  /** Changes one stored precedence without editing either template. */
  changePrecedence(
    input: ChangeTemplatePrecedenceManagerInput,
  ): Promise<TemplatePrecedenceView>;
}
