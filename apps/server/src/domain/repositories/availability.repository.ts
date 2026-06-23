import type {
  Availability,
  AvailabilityId,
  AvailabilityType,
} from '../entities/availability';
import type { ChurchId } from '../entities/church';
import type { VolunteerId } from '../entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface CreateAvailabilityInput {
  volunteerId: VolunteerId;
  type: AvailabilityType;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason?: string;
  repeatRule?: string;
}

export interface UpdateAvailabilityInput {
  type?: AvailabilityType;
  startTime?: Date;
  endTime?: Date;
  isAllDay?: boolean;
  reason?: string;
  repeatRule?: string;
}

export interface AvailabilityRepository {
  listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
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
