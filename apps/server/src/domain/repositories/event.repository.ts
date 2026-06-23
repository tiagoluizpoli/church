import type { ChurchId } from '../entities/church';
import type {
  Event,
  EventId,
  EventStatus,
  EventWithSlots,
} from '../entities/event';
import type { MinistryId } from '../entities/ministry';
import type { TransactionContext } from './transaction-context';

export interface CreateEventInput {
  ministryId: MinistryId;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  status?: EventStatus;
}

export interface UpdateEventStatusInput {
  status: EventStatus;
}

export interface EventRepository {
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
}
