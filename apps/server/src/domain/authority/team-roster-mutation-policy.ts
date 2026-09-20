import { compareInstants, type Instant } from '@church/time';
import type { TeamId } from '../branded-ids';
import type { EventStatus } from '../entities/event';
import type { ParticipationState } from '../entities/ministry-participation';

export interface AuthorizeTeamRosterMutationInput {
  teamId: TeamId;
  participationState: ParticipationState;
  eventStatus: EventStatus;
  eventStart: Instant;
  now: Instant;
  requirementTeamIds: Array<TeamId | undefined>;
  volunteerTeamIds: TeamId[];
}

export const TeamRosterMutationPolicy = {
  authorize(input: AuthorizeTeamRosterMutationInput): boolean {
    if (input.participationState !== 'rostering') return false;
    if (input.eventStatus !== 'scheduled') return false;
    if (compareInstants({ left: input.eventStart, right: input.now }) <= 0) {
      return false;
    }
    if (
      input.requirementTeamIds.length !== 1 ||
      input.requirementTeamIds[0] !== input.teamId
    ) {
      return false;
    }
    return input.volunteerTeamIds.includes(input.teamId);
  },
} as const;
