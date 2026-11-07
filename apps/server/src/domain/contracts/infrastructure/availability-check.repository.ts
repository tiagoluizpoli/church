import type { Instant } from '@church/time';
import type {
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  RoleId,
  ShiftId,
  UserId,
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
  ministryMembershipId: string;
  volunteerId: VolunteerId;
  userId: UserId;
  volunteerName: string;
}

export interface ListChecksByCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryMembershipIds?: string[];
  tx?: TransactionContext;
}

export interface NewAvailabilityCheckInput {
  cycleId: CycleId;
  ministryMembershipId: string;
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
  cycleName: string;
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
  startTime: Instant;
  endTime: Instant;
  label?: string;
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

/** One Schedule: a Ministry's part of a Cycle. */
export interface ScheduleScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface CheckMarkCountRow {
  availabilityCheckId: AvailabilityCheckId;
  unavailableShiftCount: number;
}

export interface RelevantShiftTotalRow {
  ministryMembershipId: string;
  shiftCount: number;
}

export interface ServedShiftRow {
  eventId: EventId;
  eventTimeBlockId: EventTimeBlockId;
  eventTimeBlockStartsAt: Instant;
  flagged: boolean;
}

export interface RoleWithoutHolderRow {
  roleId: RoleId;
  roleName: string;
  shiftCount: number;
}

/**
 * The actionable reads (`getCheckContext`, `listByVolunteer`, `listByCycle`,
 * `confirm`) see only checks that are not withdrawn, and the first two only
 * on an active Ministry Membership. Inside a transaction,
 * `listActiveMemberships`, `listEligibleMemberships` and `getCheckContext`
 * share-lock the memberships they return, serializing with Remove from
 * Ministry.
 *
 * The Schedule reads count a Shift when the Ministry serves it in the Cycle (a
 * non-cancelled Event) and a ShiftRequirement of it names a Role the
 * membership holds, however many requirements match.
 */
export interface AvailabilityCheckRepository {
  listActiveMemberships(
    input: ListActiveMembershipsInput,
  ): Promise<ActiveMinistryMembership[]>;
  /** Active memberships holding a Role that a served Shift needs. */
  listEligibleMemberships(
    input: ScheduleScopeInput,
  ): Promise<ActiveMinistryMembership[]>;
  /** Per non-withdrawn check of the Schedule, including zero counts. */
  listCheckMarkCounts(input: ScheduleScopeInput): Promise<CheckMarkCountRow[]>;
  /** Per active membership of the Ministry, including zero totals. */
  listRelevantShiftTotals(
    input: ScheduleScopeInput,
  ): Promise<RelevantShiftTotalRow[]>;
  /** One row per served Shift, earliest block first; flagged when it names no Role. */
  listServedShifts(input: ScheduleScopeInput): Promise<ServedShiftRow[]>;
  /** Roles a served Shift needs and no active membership holds, by name. */
  listRolesWithoutHolders(
    input: ScheduleScopeInput,
  ): Promise<RoleWithoutHolderRow[]>;
  listByCycle(input: ListChecksByCycleInput): Promise<AvailabilityCheck[]>;
  createMany(input: CreateChecksInput): Promise<AvailabilityCheck[]>;
  /** Throws `NotFoundError` unless the check is actionable. */
  getCheckContext(input: GetCheckContextInput): Promise<CheckContext>;
  listByVolunteer(input: ListChecksByVolunteerInput): Promise<CheckContext[]>;
  listCheckShifts(input: ListCheckShiftsInput): Promise<CheckShiftRow[]>;
  listMinistryLeaderVolunteerIds(
    input: ListMinistryLeaderVolunteerIdsInput,
  ): Promise<MinistryLeaderRow[]>;
  confirm(input: ConfirmCheckInput): Promise<void>;
}
