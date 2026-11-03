import type { Instant } from '@church/time';
import type { ChurchId, UserId } from '../../branded-ids';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { PersonDetailRole } from '../../entities/people-list-item';

export interface SetMinistryRolesRequest {
  /** Both from the authenticated Active Church context, never the payload. */
  churchId: ChurchId;
  actorId: UserId;
  /** Church Membership id. */
  memberId: string;
  /** Ministry Membership id. */
  membershipId: string;
  /** The complete set; omitted Roles are removals. */
  roleIds: string[];
}

export interface EndMinistryMembershipRequest {
  /** Both from the authenticated Active Church context, never the payload. */
  churchId: ChurchId;
  actorId: UserId;
  /** Church Membership id. */
  memberId: string;
  /** Ministry Membership id. */
  membershipId: string;
}

export interface MinistryMembershipEnded {
  memberId: string;
  membershipId: string;
  status: 'inactive';
  leftAt: Instant;
  changed: true;
}

export type EndMinistryMembershipOutcome =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | ({ kind: 'applied' } & MinistryMembershipEnded);

export interface MinistryMembershipChange {
  memberId: string;
  membershipId: string;
  ministryAccessLevel: MinistryAccessLevel;
  roles: PersonDetailRole[];
  changed: boolean;
}

/** `forbidden` is a refusal inside the caller's visible scope; `not-found` hides the target. */
export type MinistryMembershipOutcome =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | ({ kind: 'applied' } & MinistryMembershipChange);

/**
 * The one boundary for Ministry Membership changes: Church lock, locked
 * target, fresh authority, rules, Assignment guard, write and audit in one
 * transaction. Typed refusals throw `InvalidMinistryRoleError`,
 * `MinistryRoleRequiredError`, `MinistryMembershipInactiveError` or
 * `UpcomingAssignmentsError`.
 */
export interface IMinistryMembershipManager {
  setMinistryRoles(
    input: SetMinistryRolesRequest,
  ): Promise<MinistryMembershipOutcome>;
  /** Ends the membership, withdrawing its actionable Availability Checks; refused while an upcoming Assignment needs it. */
  endMinistryMembership(
    input: EndMinistryMembershipRequest,
  ): Promise<EndMinistryMembershipOutcome>;
}
