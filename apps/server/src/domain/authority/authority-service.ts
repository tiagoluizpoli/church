import type { MinistryId, TeamId, VolunteerId } from '../branded-ids';
import type {
  AuthorityAction,
  AuthorityActor,
  AuthorityDecision,
  AuthorityDenyReason,
  AuthorityRequest,
  ChurchResource,
  MinistryMembershipFact,
  MinistryResource,
  TeamMembershipFact,
  TeamResource,
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

interface AuthorizeTeamResourceInput {
  actor: AuthorityActor;
  action: AuthorityAction;
  resource: TeamResource;
  isAdmin: boolean;
}

interface DenyInput {
  reason: AuthorityDenyReason;
}

interface FindMinistryMembershipInput {
  actor: AuthorityActor;
  ministryId: MinistryId;
}

interface FindTeamMembershipInput {
  actor: AuthorityActor;
  teamId: TeamId;
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

function findTeamMembership(
  input: FindTeamMembershipInput,
): TeamMembershipFact | undefined {
  return input.actor.teamMemberships.find(
    (membership) => membership.teamId === input.teamId,
  );
}

/**
 * `participate` on a resource owned by one Volunteer is self-service only:
 * the actor must be that Volunteer, and a fact claiming ownership with no
 * matching Membership fact is conflicting scope data, not a grant.
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
    : deny({ reason: 'CONFLICTING_SCOPE' });
}

/** Church Membership `admin` grants management church-wide; it is never participatory. */
function authorizeChurchResource(
  input: AuthorizeChurchResourceInput,
): AuthorityDecision {
  const { action, isAdmin } = input;
  if (action === 'participate') {
    return deny({ reason: 'INSUFFICIENT_ACCESS_LEVEL' });
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
 * Team Membership is a fully independent axis from Ministry Membership:
 * leading a Ministry does not cascade into managing or participating in its
 * Teams — Team access is scoped to explicitly assigned Teams only, per the
 * matrix. Only a Church Membership `admin` override or an explicit Team
 * Membership grants `manage` here.
 */
function authorizeTeamResource(
  input: AuthorizeTeamResourceInput,
): AuthorityDecision {
  const { actor, action, resource, isAdmin } = input;
  const membership = findTeamMembership({ actor, teamId: resource.teamId });
  if (
    membership &&
    (membership.churchId !== actor.activeChurchId ||
      membership.ministryId !== resource.ministryId)
  ) {
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

    switch (resource.type) {
      case 'church':
        return authorizeChurchResource({ actor, action, resource, isAdmin });
      case 'ministry':
        return authorizeMinistryResource({
          actor,
          action,
          resource,
          isAdmin,
        });
      case 'team':
        return authorizeTeamResource({ actor, action, resource, isAdmin });
    }
  },
} as const;
