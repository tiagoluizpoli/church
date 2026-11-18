import type { ChurchAccessLevel } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';

export interface ChangeChurchAccessRequest {
  /** Both from the authenticated Active Church context, never the payload. */
  churchId: ChurchId;
  actorId: UserId;
  /** Church Membership id. */
  memberId: string;
  accessLevel: ChurchAccessLevel;
}

export type ChangeChurchAccessOutcome =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'last-admin' }
  | {
      kind: 'applied';
      memberId: string;
      accessLevel: ChurchAccessLevel;
      changed: boolean;
    };

export interface IChurchAccessManager {
  /** Sets a Church Member's Church access, keeping at least one ChurchAdmin. */
  changeChurchAccess(
    input: ChangeChurchAccessRequest,
  ): Promise<ChangeChurchAccessOutcome>;
}
