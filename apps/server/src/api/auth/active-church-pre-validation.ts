import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import { headersFromRequest } from '../utils/headers';
import { refuse } from '../utils/refuse';
import { resolveActiveChurchAndPersist } from './resolve-active-church-and-persist';

export interface CreateActiveChurchPreValidationInput {
  resolver: IActiveChurchResolver;
  /**
   * The route serves the caller's own Volunteer — e.g. their dashboard — so it
   * needs an active serving Membership, not just a leftover profile. A Church
   * admin with no Volunteer profile is a valid caller everywhere else, per the
   * authority matrix.
   */
  requireVolunteer?: boolean;
}

/**
 * The one Active-Church resolution every protected controller registers as
 * its `preValidation` hook — replaces the six duplicated hooks that each
 * derived Church by looking up the requester's Volunteer row. Resolves
 * Church from the session's active organization, revalidating Church
 * Membership on every call, and persists an auto-selected Church back onto
 * the session when the caller had exactly one Membership and none active.
 */
export function createActiveChurchPreValidation(
  input: CreateActiveChurchPreValidationInput,
): (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<FastifyReply | undefined> {
  const { resolver, requireVolunteer = false } = input;

  return async (request, reply) => {
    const headers = headersFromRequest(request);
    const session = await auth.api.getSession({ headers }).catch(() => null);
    if (!session?.user) {
      return refuse({ reply, request, code: 'UNAUTHORIZED' });
    }

    const userId = UserId.from(session.user.id);
    const activeOrganizationId = session.session.activeOrganizationId;
    const resolution = await resolveActiveChurchAndPersist({
      resolver,
      request,
      userId,
      activeOrganizationId: activeOrganizationId
        ? ChurchId.from(activeOrganizationId)
        : null,
    });

    if (resolution.status === 'selection_required') {
      return refuse({
        reply,
        request,
        code: 'ACTIVE_CHURCH_SELECTION_REQUIRED',
      });
    }

    if (resolution.status === 'no_membership') {
      // A stale active organization, if any, was already cleared by
      // resolveActiveChurchAndPersist above.
      return refuse({ reply, request, code: 'FORBIDDEN' });
    }

    if (requireVolunteer && !resolution.hasVolunteerMembership) {
      return refuse({ reply, request, code: 'FORBIDDEN' });
    }

    request.userId = session.user.id;
    request.churchId = resolution.churchId;
    if (resolution.volunteerId) {
      request.volunteerId = resolution.volunteerId;
    }
  };
}
