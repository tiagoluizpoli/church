import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
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
  resendReminder(input: ResendReminderInput): Promise<void>;
  listCheckStatuses(input: ListCheckStatusesInput): Promise<CheckStatusRow[]>;
  listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CheckStatusRow[]>;
}
