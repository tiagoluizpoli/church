import type { MinistryId, VolunteerId } from '../branded-ids';
import type {
  AuthorityAction,
  AuthorityActor,
  AuthorityDecision,
  AuthorityDenyReason,
  AuthorityRequest,
  ChurchResource,
  InvitationResource,
  MinistryMembershipFact,
  MinistryMembershipResource,
  MinistryResource,
} from './types';

interface AuthorizeChurchResourceInput {
  actor: AuthorityActor;
  action: AuthorityAction;
  resource: ChurchResource;
  isAdmin: boolean;
}

interface AuthorizeMinistryResourceInput {
  actor: AuthorityActor;
  action: AuthorityAction;
  resource: MinistryResource;
  isAdmin: boolean;
}

interface AuthorizeInvitationResourceInput {
  actor: AuthorityActor;
  action: AuthorityAction;
  resource: InvitationResource;
  isAdmin: boolean;
}

interface AuthorizeMinistryMembershipResourceInput {
  actor: AuthorityActor;
  action: AuthorityAction;
  resource: MinistryMembershipResource;
  isAdmin: boolean;
}

interface DenyInput {
  reason: AuthorityDenyReason;
}

interface FindMinistryMembershipInput {
  actor: AuthorityActor;
  ministryId: MinistryId;
}

interface EvaluateOwnedParticipationInput {
  actor: AuthorityActor;
  ownerVolunteerId: VolunteerId;
  hasMatchingMembership: boolean;
}

function allow(): AuthorityDecision {
  return { allowed: true };
}

function deny(input: DenyInput): AuthorityDecision {
  return { allowed: false, reason: input.reason };
}

function findMinistryMembership(
  input: FindMinistryMembershipInput,
): MinistryMembershipFact | undefined {
  return input.actor.ministryMemberships.find(
    (membership) => membership.ministryId === input.ministryId,
  );
}

/**
 * `participate` on a resource owned by one Volunteer is self-service only:
 * the actor must be that Volunteer and retain an active Membership.
 */
function evaluateOwnedParticipation(
  input: EvaluateOwnedParticipationInput,
): AuthorityDecision {
  const { actor, ownerVolunteerId, hasMatchingMembership } = input;
  if (ownerVolunteerId !== actor.volunteerId) {
    return deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  }
  return hasMatchingMembership
    ? allow()
    : deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
}

/** Church Membership `admin` grants management church-wide; it is never participatory. */
function authorizeChurchResource(
  input: AuthorizeChurchResourceInput,
): AuthorityDecision {
  const { actor, action, resource, isAdmin } = input;
  // Church Membership was already verified by `authorize`.
  if (action === 'access') return allow();
  if (action === 'participate') {
    const hasMatchingMembership =
      Boolean(actor.volunteerId) &&
      actor.ministryMemberships.some(
        (membership) => membership.churchId === actor.activeChurchId,
      );
    if (resource.ownerVolunteerId) {
      return evaluateOwnedParticipation({
        actor,
        ownerVolunteerId: resource.ownerVolunteerId,
        hasMatchingMembership,
      });
    }
    return hasMatchingMembership
      ? allow()
      : deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  }
  return isAdmin ? allow() : deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
}

function authorizeMinistryResource(
  input: AuthorizeMinistryResourceInput,
): AuthorityDecision {
  const { actor, action, resource, isAdmin } = input;
  const membership = findMinistryMembership({
    actor,
    ministryId: resource.ministryId,
  });
  if (membership && membership.churchId !== actor.activeChurchId) {
    return deny({ reason: 'CONFLICTING_SCOPE' });
  }

  if (action === 'manage') {
    if (isAdmin) return allow();
    if (membership?.accessLevel === 'leader') return allow();
    return deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  }

  if (resource.ownerVolunteerId) {
    return evaluateOwnedParticipation({
      actor,
      ownerVolunteerId: resource.ownerVolunteerId,
      hasMatchingMembership: Boolean(membership),
    });
  }

  return membership ? allow() : deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
}

/**
 * Managing an offer: an admin manages any; a Ministry leader manages only
 * volunteer-level offers of a Ministry they lead. Nobody participates in one.
 */
function authorizeInvitationResource(
  input: AuthorizeInvitationResourceInput,
): AuthorityDecision {
  const { actor, action, resource, isAdmin } = input;
  if (action !== 'manage') return deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  if (isAdmin) return allow();
  const { ministryId, ministryAccessLevel } = resource;
  if (!ministryId) return deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  const membership = findMinistryMembership({ actor, ministryId });
  if (membership && membership.churchId !== actor.activeChurchId) {
    return deny({ reason: 'CONFLICTING_SCOPE' });
  }
  return membership?.accessLevel === 'leader' &&
    ministryAccessLevel === 'volunteer'
    ? allow()
    : deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
}

/**
 * Managing one Ministry Membership: an admin may do anything. A leader of
 * that Ministry edits their own Roles and volunteer-level members' Roles, and
 * ends only volunteer-level memberships; a leader never changes a Ministry
 * Access Level. A Ministry the actor does not lead is outside their scope,
 * while a refused target inside it is an insufficient access level.
 */
function authorizeMinistryMembershipResource(
  input: AuthorizeMinistryMembershipResourceInput,
): AuthorityDecision {
  const { actor, action, resource, isAdmin } = input;
  if (action !== 'manage') return deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  if (isAdmin) return allow();
  const membership = findMinistryMembership({
    actor,
    ministryId: resource.ministryId,
  });
  if (membership && membership.churchId !== actor.activeChurchId) {
    return deny({ reason: 'CONFLICTING_SCOPE' });
  }
  if (membership?.accessLevel !== 'leader') {
    return deny({ reason: 'OUTSIDE_SCOPE' });
  }
  const volunteerTarget = resource.ministryAccessLevel === 'volunteer';
  const permitted =
    resource.operation === 'editRoles'
      ? volunteerTarget || resource.subjectUserId === actor.userId
      : resource.operation === 'endMembership' && volunteerTarget;
  return permitted ? allow() : deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
}

export const AuthorityService = {
  /**
   * Answers one application authorization question, dispatching internally
   * by `resource.type`. Missing, stale, cross-Church, or conflicting scope
   * data all deny before any resource-specific rule runs.
   */
  authorize(request: AuthorityRequest): AuthorityDecision {
    const { actor, action, resource } = request;

    if (!actor.churchMembership) {
      return deny({ reason: 'NO_CHURCH_MEMBERSHIP' });
    }
    if (actor.churchMembership.churchId !== actor.activeChurchId) {
      return deny({ reason: 'STALE_CHURCH_MEMBERSHIP' });
    }
    if (resource.churchId !== actor.activeChurchId) {
      return deny({ reason: 'CROSS_CHURCH_RESOURCE' });
    }

    const isAdmin = actor.churchMembership.accessLevel === 'admin';

    let decision: AuthorityDecision;
    switch (resource.type) {
      case 'church':
        decision = authorizeChurchResource({
          actor,
          action,
          resource,
          isAdmin,
        });
        break;
      case 'ministry':
        decision = authorizeMinistryResource({
          actor,
          action,
          resource,
          isAdmin,
        });
        break;
      case 'invitation':
        decision = authorizeInvitationResource({
          actor,
          action,
          resource,
          isAdmin,
        });
        break;
      case 'ministryMembership':
        decision = authorizeMinistryMembershipResource({
          actor,
          action,
          resource,
          isAdmin,
        });
        break;
    }
    if (
      !decision.allowed &&
      decision.reason === 'INSUFFICIENT_ACCESS_LEVEL' &&
      request.scope === 'object'
    ) {
      return deny({ reason: 'OUTSIDE_SCOPE' });
    }
    return decision;
  },
} as const;
