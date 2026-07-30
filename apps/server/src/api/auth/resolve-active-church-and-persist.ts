import { auth } from '@church/auth';
import type { FastifyRequest } from 'fastify';
import type { ChurchId, UserId } from '../../domain/branded-ids';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
} from '../../domain/contracts/application/active-church-resolver';
import { headersFromRequest } from '../utils/headers';

export interface ResolveActiveChurchAndPersistInput {
  resolver: IActiveChurchResolver;
  request: FastifyRequest;
  userId: UserId;
  activeOrganizationId: ChurchId | null;
}

/**
 * The one place `IActiveChurchResolver.resolve` is called and its
 * silent-auto-select outcome persisted back onto the Better Auth session —
 * shared by `createActiveChurchPreValidation` (every protected controller)
 * and the entry-gate status endpoint the client polls before any Church is
 * known, so the two never resolve auto-selection differently.
 */
export async function resolveActiveChurchAndPersist(
  input: ResolveActiveChurchAndPersistInput,
): Promise<ActiveChurchResolution> {
  const { resolver, request, userId, activeOrganizationId } = input;
  const resolution = await resolver.resolve({ userId, activeOrganizationId });

  if (resolution.status === 'resolved' && resolution.autoSelected) {
    // Best-effort persistence: the request still proceeds against the
    // Church just resolved even if the session write fails, and the next
    // request simply resolves the same way again.
    await auth.api
      .setActiveOrganization({
        headers: headersFromRequest(request),
        body: { organizationId: resolution.churchId },
      })
      .catch((error) => {
        request.log.warn(
          { err: error },
          'Failed to persist auto-selected active organization onto session',
        );
      });
  } else if (resolution.status !== 'resolved' && activeOrganizationId) {
    // The session named a Church that no longer resolves as active — either
    // its Membership was removed (no_membership) or several remain and none
    // is chosen yet (selection_required). Clearing it here, in the one place
    // both the pre-validation hook and the entry-gate status endpoint route
    // through, lets the next request self-heal instead of repeating this
    // same outcome against a stale id.
    await auth.api
      .setActiveOrganization({
        headers: headersFromRequest(request),
        body: { organizationId: null },
      })
      .catch((error) => {
        request.log.warn(
          { err: error },
          'Failed to clear stale active organization from session',
        );
      });
  }

  return resolution;
}
