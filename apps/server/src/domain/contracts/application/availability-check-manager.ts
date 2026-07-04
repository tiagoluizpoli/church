import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
} from '../../branded-ids';
import type { AvailabilityCheckState } from '../../entities/availability-check';

export interface FireAvailabilityInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface FireAvailabilityResult {
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
  cycleId: PlanningCycleId;
  ministryId: MinistryId;
}

/** Per-membership acknowledgement status; `state` absent means no check fired yet. */
export interface CheckStatusRow {
  volunteerId: string;
  volunteerName: string;
  state?: AvailabilityCheckState;
  confirmedAt?: Date;
}

export interface IAvailabilityCheckManager {
  fireAvailability(
    input: FireAvailabilityInput,
  ): Promise<FireAvailabilityResult>;
  resendReminder(input: ResendReminderInput): Promise<void>;
  listCheckStatuses(input: ListCheckStatusesInput): Promise<CheckStatusRow[]>;
  listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CheckStatusRow[]>;
}
