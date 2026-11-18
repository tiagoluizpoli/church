import type { CalendarDay, Instant } from '@church/time';
import type { ChurchId, CycleId, MinistryId, RoleId } from '../../branded-ids';
import type { AvailabilityCheckState } from '../../entities/availability-check';
import type { FlaggedBlock } from '../../errors/ask-blocked-flagged-shifts';

export interface AskScheduleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  answerBy?: CalendarDay;
}

export interface SetDeadlineInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  answerBy: CalendarDay | null;
}

export interface AskScheduleResult {
  createdCheckCount: number;
  notifiedVolunteerCount: number;
  rolesWithoutHolders: AskPreviewRoleWithoutHolders[];
}

export interface RemindScheduleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
}

export interface RemindScheduleResult {
  remindedCount: number;
  newCheckCount: number;
  remindAvailableAt: Instant;
}

export interface ListCycleCheckStatusesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

/** One asked Volunteer: an existing, non-withdrawn check on an active membership. */
export interface CheckStatusRow {
  volunteerId: string;
  volunteerName: string;
  state: AvailabilityCheckState;
  confirmedAt?: Instant;
  unavailableShiftCount: number;
  /** Shifts needing a Role the Volunteer holds: the "3 of 12" basis. */
  shiftCount: number;
}

export interface CycleCheckStatuses {
  asked: number;
  confirmed: number;
  answerBy: CalendarDay | null;
  /** When Remind is next allowed; `null` while it is allowed now. */
  remindAvailableAt: Instant | null;
  statuses: CheckStatusRow[];
}

export interface GetAskPreviewInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

export interface AskPreviewRoleWithoutHolders {
  roleId: RoleId;
  roleName: string;
  shiftCount: number;
}

/** What an Ask would cover; the Ministry serving nothing reads as zeroes. */
export interface AskPreview {
  eligibleVolunteerCount: number;
  shiftCount: number;
  eventCount: number;
  flaggedBlocks: FlaggedBlock[];
  rolesWithoutHolders: AskPreviewRoleWithoutHolders[];
}

export interface IAvailabilityCheckManager {
  getAskPreview(input: GetAskPreviewInput): Promise<AskPreview>;
  askSchedule(input: AskScheduleInput): Promise<AskScheduleResult>;
  remindSchedule(input: RemindScheduleInput): Promise<RemindScheduleResult>;
  /** Set, move or clear the Deadline silently: no Notification is enqueued. */
  setDeadline(input: SetDeadlineInput): Promise<void>;
  listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CycleCheckStatuses>;
}
