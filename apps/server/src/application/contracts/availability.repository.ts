import type {
  Availability,
  AvailabilityId,
  AvailabilityType,
} from '../../domain/entities/availability';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { VolunteerId } from '../../domain/entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface CreateAvailabilityInput {
  volunteerId: VolunteerId;
  eventId?: EventId;
  type: AvailabilityType;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason?: string;
  repeatRule?: string;
}

export interface UpdateAvailabilityInput {
  eventId?: EventId;
  type?: AvailabilityType;
  startTime?: Date;
  endTime?: Date;
  isAllDay?: boolean;
  reason?: string;
  repeatRule?: string;
}

export interface AvailabilityRepository {
  getById(
    churchId: ChurchId,
    id: AvailabilityId,
    tx?: TransactionContext,
  ): Promise<Availability>;

  listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Availability[]>;

  listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Availability[]>;

  /** Bulk-fetch availability entries for a set of volunteers. */
  listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Availability[]>;

  create(
    churchId: ChurchId,
    input: CreateAvailabilityInput,
    tx?: TransactionContext,
  ): Promise<Availability>;

  update(
    churchId: ChurchId,
    id: AvailabilityId,
    input: UpdateAvailabilityInput,
    tx?: TransactionContext,
  ): Promise<void>;

  delete(
    churchId: ChurchId,
    id: AvailabilityId,
    tx?: TransactionContext,
  ): Promise<void>;
}
