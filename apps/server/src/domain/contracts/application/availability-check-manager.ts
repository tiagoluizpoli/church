import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
} from '../../branded-ids';
import type { AvailabilityCheckState } from '../../entities/availability-check';

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

export interface RoleWithoutHolders {
  roleId: RoleId;
  roleName: string;
  shiftCount: number;
}

export interface AskScheduleResult extends AskAvailabilityResult {
  rolesWithoutHolders: RoleWithoutHolders[];
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

export interface IAvailabilityCheckManager {
  askAvailability(input: AskAvailabilityInput): Promise<AskAvailabilityResult>;
  askSchedule(input: AskScheduleInput): Promise<AskScheduleResult>;
  resendReminder(input: ResendReminderInput): Promise<void>;
  listCheckStatuses(input: ListCheckStatusesInput): Promise<CheckStatusRow[]>;
  listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CheckStatusRow[]>;
}
