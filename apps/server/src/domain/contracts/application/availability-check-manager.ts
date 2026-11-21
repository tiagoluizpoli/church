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

/** Where an asked Volunteer stands: not confirmed, confirmed with no marks, or confirmed with some Shifts marked unavailable. */
export const ANSWER_STATUS_OPTIONS = [
  'pending',
  'available',
  'unavailable',
] as const;
export type AnswerStatus = (typeof ANSWER_STATUS_OPTIONS)[number];

export interface ListCycleCheckStatusesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  /** Keeps one answer status. */
  status?: AnswerStatus;
  /** Case-insensitive Volunteer name search. */
  q?: string;
  cursor?: string;
  /** Page size; omitted answers every matching Volunteer. */
  limit?: number;
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
  /** Asked Volunteers per answer status, ignoring the filters and the cursor. */
  counts: Record<AnswerStatus, number>;
  /** The page of matching Volunteers, ordered by name then id. */
  statuses: CheckStatusRow[];
  /** Position after the last returned row; null on the last page. */
  nextCursor: string | null;
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
