import type { ChurchId, UserId, VolunteerId } from '../../branded-ids';

export interface ResolveActiveChurchInput {
  userId: UserId;
  /** `session.session.activeOrganizationId`, or `null` if the session carries none yet. */
  activeOrganizationId: ChurchId | null;
}

/**
 * Present on every variant only when this resolution replaces a session
 * active organization whose Church Membership was just found gone — never
 * set for a caller who simply never had an active Church yet.
 */
export interface MembershipRemovalNotice {
  /** Name of the Church the caller's Membership was removed from. */
  membershipRemovedFrom?: string;
}

export interface ResolvedActiveChurch extends MembershipRemovalNotice {
  status: 'resolved';
  churchId: ChurchId;
  /** The caller's own Volunteer profile in `churchId`, if any — a Church admin may have none. */
  volunteerId: VolunteerId | null;
  /**
   * True when no active organization was on the session and exactly one
   * Church Membership existed, so this Church was selected on the caller's
   * behalf. The caller (the HTTP boundary) is responsible for persisting the
   * choice back onto the session via Better Auth.
   */
  autoSelected: boolean;
}

/** No Church Membership resolves for the caller: none at all, or the session's active organization no longer does. */
export interface NoChurchMembership extends MembershipRemovalNotice {
  status: 'no_membership';
}

/** Several Church Memberships exist and none is active — resolvable only once a selector exists. */
export interface ActiveChurchSelectionRequired extends MembershipRemovalNotice {
  status: 'selection_required';
}

export type ActiveChurchResolution =
  | ResolvedActiveChurch
  | NoChurchMembership
  | ActiveChurchSelectionRequired;

/**
 * Resolves the Church a protected request runs against from the session's
 * active organization, revalidating Church Membership on every call —
 * replaces deriving Church from the requester's Volunteer row.
 */
export interface IActiveChurchResolver {
  resolve(input: ResolveActiveChurchInput): Promise<ActiveChurchResolution>;
}
