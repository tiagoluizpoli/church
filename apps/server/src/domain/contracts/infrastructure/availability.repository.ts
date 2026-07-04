import type {
  AvailabilityCheckId,
  ChurchId,
  EventId,
  ShiftId,
  VolunteerId,
} from '../../branded-ids';
import type { Availability } from '../../entities/availability';
import type { TransactionContext } from './transaction-context';

export interface ListMarksByCheckInput {
  churchId: ChurchId;
  availabilityCheckId: AvailabilityCheckId;
  tx?: TransactionContext;
}

export interface ReplaceMarksForCheckInput {
  churchId: ChurchId;
  availabilityCheckId: AvailabilityCheckId;
  shiftIds: ShiftId[];
  tx?: TransactionContext;
}

/** Unavailability marks: existence of a row = volunteer unavailable for that shift. */
export interface AvailabilityRepository {
  listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Availability[]>;

  /** Bulk-fetch unavailability marks for a set of volunteers. */
  listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Availability[]>;

  listMarksByCheck(input: ListMarksByCheckInput): Promise<Availability[]>;

  /** Replaces the check's full mark set (PUT semantics). */
  replaceMarksForCheck(input: ReplaceMarksForCheckInput): Promise<void>;
}
