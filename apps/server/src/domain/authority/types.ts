import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../branded-ids';
import type { MinistryAccessLevel } from '../entities/ministry-membership';

export const CHURCH_ACCESS_LEVEL_OPTIONS = ['member', 'admin'] as const;
export type ChurchAccessLevel = (typeof CHURCH_ACCESS_LEVEL_OPTIONS)[number];

/**
 * `manage` is the administrative/leadership capability over a scope.
 * `participate` is the capability to be the subject of a scope's own
 * activity (e.g. served, assigned, scheduled) — a Church Membership `admin`
 * override never grants it; only an actual Ministry Membership, or
 * being the resource's own owner, does.
 */
export type AuthorityAction = 'manage' | 'participate';

export interface ChurchMembershipFact {
  churchId: ChurchId;
  accessLevel: ChurchAccessLevel;
}

export interface MinistryMembershipFact {
  churchId: ChurchId;
  ministryId: MinistryId;
  accessLevel: MinistryAccessLevel;
  /**
   * Roles the Volunteer is qualified for within this Ministry. Never a
   * capability source for AuthorityService — Role is a function performed,
   * not an Access Level — carried here only because it is one of the
   * resolved facts callers hand in.
   */
  qualifiedRoleIds: RoleId[];
}

/**
 * Already-resolved domain facts about the caller. AuthorityService never
 * fetches these itself — the caller (a future infrastructure adapter)
 * resolves them from real repositories before invoking the service.
 */
export interface AuthorityActor {
  userId: UserId;
  /** The caller's own Volunteer profile in the active Church, if any. */
  volunteerId: VolunteerId | null;
  activeChurchId: ChurchId;
  churchMembership: ChurchMembershipFact | null;
  ministryMemberships: MinistryMembershipFact[];
}

export interface ChurchResource {
  type: 'church';
  churchId: ChurchId;
  ownerVolunteerId?: VolunteerId;
}

export interface MinistryResource {
  type: 'ministry';
  churchId: ChurchId;
  ministryId: MinistryId;
  /** Present for a resource that belongs to one Volunteer (e.g. their own AvailabilityCheck). */
  ownerVolunteerId?: VolunteerId;
}

export type AuthorityResource = ChurchResource | MinistryResource;

export type AuthorityScope = 'function' | 'object';

export interface AuthorityRequest {
  actor: AuthorityActor;
  action: AuthorityAction;
  resource: AuthorityResource;
  scope?: AuthorityScope;
}

export type AuthorityDenyReason =
  | 'RESOURCE_NOT_FOUND'
  | 'OUTSIDE_SCOPE'
  | 'NO_CHURCH_MEMBERSHIP'
  | 'STALE_CHURCH_MEMBERSHIP'
  | 'CROSS_CHURCH_RESOURCE'
  | 'CONFLICTING_SCOPE'
  | 'INSUFFICIENT_ACCESS_LEVEL';

export type AuthorityDecision =
  | { allowed: true }
  | { allowed: false; reason: AuthorityDenyReason };
