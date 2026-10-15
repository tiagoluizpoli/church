import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  TemplateTimeBlockId,
} from '../../branded-ids';
import type {
  Event,
  EventStatus,
  EventWithEventTimeBlocks,
} from '../../entities/event';
import type { TransactionContext } from './transaction-context';

export interface CreatePlanningEventInput {
  churchId: ChurchId;
  cycleId: CycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  status: EventStatus;
  tx?: TransactionContext;
}

export interface UpdatePlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  title?: string;
  description?: string;
  location?: string;
  start?: Date;
  end?: Date;
  status?: EventStatus;
  tx?: TransactionContext;
}

export interface GetPlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface DeletePlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListCycleEventsInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface CreatePlanningEventTimeBlockInput {
  churchId: ChurchId;
  eventId: EventId;
  sourceTemplateTimeBlockId?: TemplateTimeBlockId;
  startTime: Date;
  endTime: Date;
  label?: string;
  tx?: TransactionContext;
}

export interface SeedPlanningParticipationsInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface PlanningEventRepository {
  createEvent(input: CreatePlanningEventInput): Promise<Event>;
  updateEvent(input: UpdatePlanningEventInput): Promise<Event>;
  getEvent(input: GetPlanningEventInput): Promise<Event>;
  /**
   * Hard-deletes an event row. The `event → eventTimeBlock → shift → assignment`
   * (and `assignment → assignmentAudit`) foreign keys all cascade, so event time blocks,
   * shifts, draft assignments and their audits go with it. Only ever called
   * for `draft` events — those never reached `scheduled`, so no volunteer has
   * seen them (see BL-020 / issue #12).
   */
  deleteEvent(input: DeletePlanningEventInput): Promise<void>;
  listCycleEvents(
    input: ListCycleEventsInput,
  ): Promise<EventWithEventTimeBlocks[]>;
  createEventTimeBlock(
    input: CreatePlanningEventTimeBlockInput,
  ): Promise<EventTimeBlockId>;
  seedParticipations(input: SeedPlanningParticipationsInput): Promise<void>;
}
