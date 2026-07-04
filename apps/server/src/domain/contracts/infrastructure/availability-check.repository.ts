import type {
  AvailabilityCheckId,
  ChurchId,
  EventId,
  MinistryId,
  PlanningCycleId,
  ShiftId,
  VolunteerId,
} from '../../branded-ids';
import type { AvailabilityCheck } from '../../entities/availability-check';
import type { TransactionContext } from './transaction-context';

export interface ListActiveMembershipsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface ActiveMinistryMembership {
  ministryVolunteerId: string;
  volunteerId: VolunteerId;
  volunteerName: string;
}

export interface ListChecksByCycleInput {
  churchId: ChurchId;
  planningCycleId: PlanningCycleId;
  ministryVolunteerIds?: string[];
  tx?: TransactionContext;
}

export interface NewAvailabilityCheckInput {
  planningCycleId: PlanningCycleId;
  ministryVolunteerId: string;
}

export interface CreateChecksInput {
  churchId: ChurchId;
  checks: NewAvailabilityCheckInput[];
  tx?: TransactionContext;
}

export interface GetCheckContextInput {
  churchId: ChurchId;
  checkId: AvailabilityCheckId;
  tx?: TransactionContext;
}

/** Check + everything its membership implies, resolved in one query. */
export interface CheckContext {
  check: AvailabilityCheck;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  ministryName: string;
  planningCycleName: string;
  /** Church timezone for date-only (whole-day) expansion. */
  timeZone: string;
}

export interface ListChecksByVolunteerInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface ListCheckShiftsInput {
  churchId: ChurchId;
  checkId: AvailabilityCheckId;
  tx?: TransactionContext;
}

/** A shift inside the check's scope (its membership ministry × its cycle). */
export interface CheckShiftRow {
  shiftId: ShiftId;
  eventId: EventId;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface ListUnmarkedVolunteerShiftsInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  planningCycleId: PlanningCycleId;
  tx?: TransactionContext;
}

/** A shift the volunteer is still available for (no mark), across all their checks in the cycle. */
export interface UnmarkedVolunteerShiftRow {
  shiftId: ShiftId;
  ministryId: MinistryId;
  startTime: Date;
  endTime: Date;
}

export interface ListMinistryLeaderVolunteerIdsInput {
  churchId: ChurchId;
  ministryIds: MinistryId[];
  tx?: TransactionContext;
}

export interface MinistryLeaderRow {
  ministryId: MinistryId;
  volunteerId: VolunteerId;
}

export interface ConfirmCheckInput {
  churchId: ChurchId;
  checkId: AvailabilityCheckId;
  confirmedAt: Date;
  tx?: TransactionContext;
}

export interface AvailabilityCheckRepository {
  listActiveMemberships(
    input: ListActiveMembershipsInput,
  ): Promise<ActiveMinistryMembership[]>;
  listByCycle(input: ListChecksByCycleInput): Promise<AvailabilityCheck[]>;
  createMany(input: CreateChecksInput): Promise<AvailabilityCheck[]>;
  getCheckContext(input: GetCheckContextInput): Promise<CheckContext>;
  listByVolunteer(input: ListChecksByVolunteerInput): Promise<CheckContext[]>;
  listCheckShifts(input: ListCheckShiftsInput): Promise<CheckShiftRow[]>;
  listUnmarkedVolunteerShifts(
    input: ListUnmarkedVolunteerShiftsInput,
  ): Promise<UnmarkedVolunteerShiftRow[]>;
  listMinistryLeaderVolunteerIds(
    input: ListMinistryLeaderVolunteerIdsInput,
  ): Promise<MinistryLeaderRow[]>;
  confirm(input: ConfirmCheckInput): Promise<void>;
}
