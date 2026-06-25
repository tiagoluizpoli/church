import { TRPCError } from '@trpc/server';
import type { MinistryId } from '../../domain/entities/ministry';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';

export interface AuthContext {
  volunteerId: string;
  churchId: string;
  systemRole: 'admin' | 'leader';
  ministryId: string;
}

/**
 * Resolves the calling user's volunteer identity and verifies they hold
 * leadership (or admin) rights over the target ministry.
 *
 * Uses VolunteerRepository — no direct DB imports allowed here.
 */
export async function authorizeLeaderOrAdmin(
  userId: string,
  targetMinistryId: string,
): Promise<AuthContext> {
  // 1. Resolve volunteer from session userId (no churchId required here)
  const vol = await repositories.volunteers.findByUserIdGlobally(
    userId as UserId,
  );

  if (!vol) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Active volunteer profile not found',
    });
  }

  // 2. List ministries where this volunteer is a leader
  const ledMinistries = await repositories.volunteers.listLedMinistries(
    vol.churchId,
    vol.id,
  );

  const isLeaderOfTarget = ledMinistries.some(
    (l) => l.ministryId === targetMinistryId,
  );
  const isAdmin = ledMinistries.some(
    (l) => l.ministryName === 'Administration',
  );

  if (!isLeaderOfTarget && !isAdmin) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message:
        'User is not authorized as a leader for this ministry or administration',
    });
  }

  const systemRole: 'admin' | 'leader' = isAdmin ? 'admin' : 'leader';

  return {
    volunteerId: vol.id,
    churchId: vol.churchId,
    systemRole,
    ministryId: isLeaderOfTarget
      ? (targetMinistryId as MinistryId)
      : (ledMinistries.find((l) => l.ministryName === 'Administration')
          ?.ministryId ?? ''),
  };
}
