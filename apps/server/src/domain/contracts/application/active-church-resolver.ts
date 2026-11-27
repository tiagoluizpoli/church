import type { AuthorityActor } from '../../authority/types';
import type { ChurchId, UserId, VolunteerId } from '../../branded-ids';
import type { AuthorityActorRepository } from '@/domain/contracts/infrastructure/authority-actor.repository';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { ChurchMembershipRepository } from '@/domain/contracts/infrastructure/church-membership.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

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
   * The caller serves here: an active Volunteer profile with at least one
   * active Ministry Membership in `churchId` — the gate for serving-only routes.
   */
  hasVolunteerMembership: boolean;
  /**
   * The whole caller this resolution was decided on, read fresh for this
   * request: the request's authority checks reuse it instead of reading the
   * caller again. Never kept across requests.
   */
  actor: AuthorityActor;
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

/** Any resolution that names no Active Church — so carries no Church Timezone either. */
export type UnresolvedActiveChurch =
  | NoChurchMembership
  | ActiveChurchSelectionRequired;

export type ActiveChurchResolution =
  | ResolvedActiveChurch
  | UnresolvedActiveChurch;

/**
 * Resolves the Church a protected request runs against from the session's
 * active organization, revalidating Church Membership on every call —
 * replaces deriving Church from the requester's Volunteer row.
 */
export interface IActiveChurchResolver {
  resolve(input: ResolveActiveChurchInput): Promise<ActiveChurchResolution>;
}

export interface ResolveAgainstChurchInput {
  userId: UserId;
  churchId: ChurchId;
  autoSelected: boolean;
  tx?: TransactionContext;
}

export interface ResolveWithNoActiveOrganizationInput {
  userId: UserId;
  tx: TransactionContext;
}

export interface ResolveAfterMembershipRemovedInput {
  userId: UserId;
  formerChurchId: ChurchId;
}

/** Only the silent auto-select touches "last opened": a request against an
 * already-active Church must not bump it on every call. */
export interface AutoSelectChurchInput {
  userId: UserId;
}

export interface DbActiveChurchResolverDependencies {
  actorRepository: AuthorityActorRepository;
  membershipRepository: ChurchMembershipRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
}
