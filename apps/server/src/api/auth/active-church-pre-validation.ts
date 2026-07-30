import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import { headersFromRequest } from '../utils/headers';
import { resolveActiveChurchAndPersist } from './resolve-active-church-and-persist';

export interface CreateActiveChurchPreValidationInput {
  resolver: IActiveChurchResolver;
  /**
   * The route's own Volunteer, not the Church, requires this — e.g. a
   * Volunteer's own dashboard. A Church admin with no Volunteer profile is a
   * valid caller everywhere else, per the authority matrix.
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
      return reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
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
      return reply.status(409).send({
        error: 'ACTIVE_CHURCH_SELECTION_REQUIRED',
        message: 'Select an active Church before continuing',
      });
    }

    if (resolution.status === 'no_membership') {
      if (activeOrganizationId) {
        // The session named a Church the caller no longer belongs to.
        // Clearing it lets the next request self-heal: a User down to one
        // remaining Membership is auto-selected into it, rather than
        // repeating this same deny against the stale Church forever.
        await auth.api
          .setActiveOrganization({ headers, body: { organizationId: null } })
          .catch((error) => {
            request.log.warn(
              { err: error },
              'Failed to clear stale active organization from session',
            );
          });
      }
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'No active Church membership found',
      });
    }

    if (requireVolunteer && !resolution.volunteerId) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Volunteer profile not found',
      });
    }

    request.userId = session.user.id;
    request.churchId = resolution.churchId;
    if (resolution.volunteerId) {
      request.volunteerId = resolution.volunteerId;
    }
  };
}
