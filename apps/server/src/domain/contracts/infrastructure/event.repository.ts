import type {
  ChurchId,
  EventId,
  EventTemplateId,
  MinistryId,
  PlanningCycleId,
} from '../../branded-ids';
import type {
  Event,
  EventStatus,
  EventType,
  EventWithSlots,
} from '../../entities/event';
import type { TransactionContext } from './transaction-context';

export interface CreateEventInput {
  planningCycleId: PlanningCycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  status?: EventStatus;
  eventType?: EventType;
}

export interface UpdateEventStatusInput {
  status: EventStatus;
}

export interface UpdateEventInput {
  title?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface EventRepository {
  getMinistryId(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<MinistryId>;

  getById(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<Event>;

  getWithSlots(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<EventWithSlots>;

  listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    status?: EventStatus,
    tx?: TransactionContext,
  ): Promise<Event[]>;

  create(
    churchId: ChurchId,
    input: CreateEventInput,
    tx?: TransactionContext,
  ): Promise<Event>;

  updateStatus(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventStatusInput,
    tx?: TransactionContext,
  ): Promise<void>;

  update(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventInput,
    tx?: TransactionContext,
  ): Promise<Event>;
}
