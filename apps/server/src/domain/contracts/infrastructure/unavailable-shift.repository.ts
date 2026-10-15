import type {
  AvailabilityCheckId,
  ChurchId,
  EventId,
  ShiftId,
  VolunteerId,
} from '../../branded-ids';
import type { UnavailableShift } from '../../entities/unavailable-shift';
import type { TransactionContext } from './transaction-context';

export interface ListUnavailableShiftsByCheckInput {
  churchId: ChurchId;
  availabilityCheckId: AvailabilityCheckId;
  tx?: TransactionContext;
}

export interface ReplaceUnavailableShiftsForCheckInput {
  churchId: ChurchId;
  availabilityCheckId: AvailabilityCheckId;
  shiftIds: ShiftId[];
  tx?: TransactionContext;
}

/** Unavailable shifts: existence of a row = volunteer unavailable for that shift. */
export interface UnavailableShiftRepository {
  listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<UnavailableShift[]>;

  /** Bulk-fetch unavailable shifts for a set of volunteers. */
  listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<UnavailableShift[]>;

  listUnavailableShiftsByCheck(
    input: ListUnavailableShiftsByCheckInput,
  ): Promise<UnavailableShift[]>;

  /** Replaces the check's full set of unavailable shifts (PUT semantics). */
  replaceUnavailableShiftsForCheck(
    input: ReplaceUnavailableShiftsForCheckInput,
  ): Promise<void>;
}
