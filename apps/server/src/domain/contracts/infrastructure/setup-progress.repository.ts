import type { ChurchId } from '../../branded-ids';

/** Church setup facts, each derived from live data; nothing is persisted. */
export interface SetupProgress {
  hasMinistry: boolean;
  /** One active Ministry holds both an active Sector and an active Role. */
  hasMinistryWithSectorsAndRoles: boolean;
  /** A leader-level Ministry Invitation was issued and not revoked or declined. */
  hasInvitedLeader: boolean;
  hasEventTemplate: boolean;
  /** Durable Send history: an expired unsent draft never counts. */
  hasEverSentCycle: boolean;
}

export interface GetSetupProgressInput {
  churchId: ChurchId;
}

export interface SetupProgressRepository {
  get(input: GetSetupProgressInput): Promise<SetupProgress>;
}
