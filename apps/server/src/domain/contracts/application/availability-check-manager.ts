import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
} from '../../branded-ids';
import type { AvailabilityCheckState } from '../../entities/availability-check';
import type { FlaggedBlock } from '../../errors/ask-blocked-flagged-shifts';

export interface AskAvailabilityInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface AskAvailabilityResult {
  createdCheckCount: number;
  notifiedVolunteerCount: number;
}

export interface AskScheduleInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
}

export interface AskScheduleResult extends AskAvailabilityResult {
  rolesWithoutHolders: AskPreviewRoleWithoutHolders[];
}

export interface ResendReminderInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface ListCheckStatusesInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface ListCycleCheckStatusesInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

/** Per-membership acknowledgement status; `state` absent means no check requested yet. */
export interface CheckStatusRow {
  volunteerId: string;
  volunteerName: string;
  state?: AvailabilityCheckState;
  confirmedAt?: Instant;
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
  askAvailability(input: AskAvailabilityInput): Promise<AskAvailabilityResult>;
  askSchedule(input: AskScheduleInput): Promise<AskScheduleResult>;
  resendReminder(input: ResendReminderInput): Promise<void>;
  listCheckStatuses(input: ListCheckStatusesInput): Promise<CheckStatusRow[]>;
  listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CheckStatusRow[]>;
}
