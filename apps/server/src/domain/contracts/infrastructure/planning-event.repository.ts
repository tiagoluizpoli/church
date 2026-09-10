import type {
  ChurchId,
  EventId,
  EventTemplateId,
  PlanningCycleId,
  TimeBlockId,
  TimeSlotId,
} from '../../branded-ids';
import type {
  Event,
  EventStatus,
  EventType,
  EventWithSlots,
} from '../../entities/event';
import type { TransactionContext } from './transaction-context';

export interface CreatePlanningEventInput {
  churchId: ChurchId;
  planningCycleId: PlanningCycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  status: EventStatus;
  eventType: EventType;
  tx?: TransactionContext;
}

export interface UpdatePlanningEventInput {
  churchId: ChurchId;
  eventId: EventId;
  title?: string;
  description?: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
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

export interface ListPlanningCycleEventsInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  tx?: TransactionContext;
}

export interface CreatePlanningTimeSlotInput {
  churchId: ChurchId;
  eventId: EventId;
  sourceTemplateBlockId?: TimeBlockId;
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
   * Hard-deletes an event row. The `event → timeSlot → shift → assignment`
   * (and `assignment → assignmentAudit`) foreign keys all cascade, so slots,
   * shifts, draft assignments and their audits go with it. Only ever called
   * for `draft` events — those never reached `scheduled`, so no volunteer has
   * seen them (see BL-020 / issue #12).
   */
  deleteEvent(input: DeletePlanningEventInput): Promise<void>;
  listCycleEvents(
    input: ListPlanningCycleEventsInput,
  ): Promise<EventWithSlots[]>;
  createTimeSlot(input: CreatePlanningTimeSlotInput): Promise<TimeSlotId>;
  seedParticipations(input: SeedPlanningParticipationsInput): Promise<void>;
}
