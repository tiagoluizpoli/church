import type { ChurchId, MinistryParticipationId } from '../../branded-ids';

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

export interface IAvailabilityCheckManager {
  fireAvailability(
    input: FireAvailabilityInput,
  ): Promise<FireAvailabilityResult>;
  resendReminder(input: ResendReminderInput): Promise<void>;
}
