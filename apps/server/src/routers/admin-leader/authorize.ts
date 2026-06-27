import { TRPCError } from '@trpc/server';
import type { MinistryId } from '../../domain/entities/ministry';
import type { UserId } from '../../domain/entities/volunteer';
import type {
  MinistryMembership,
  VolunteerLeadership,
} from '../../domain/repositories/volunteer.repository';
import { repositories } from '../../infrastructure/repositories/registry';

export interface AuthContext {
  volunteerId: string;
  churchId: string;
  systemRole: 'admin' | 'leader';
  ministryId: string;
}

export const BUILDER_ACCESS_ROLES = ['admin', 'leader', 'sub_leader'] as const;
export type BuilderAccessRole = (typeof BUILDER_ACCESS_ROLES)[number];

export interface BuilderAccessContext {
  volunteerId: string;
  churchId: string;
  systemRole: BuilderAccessRole;
  ministryId: string;
  /** Set only for sub-leaders — the team whose cells they may edit. */
  teamId: string | null;
}

interface ResolvedVolunteerContext {
  volunteerId: string;
  churchId: string;
  ledMinistries: VolunteerLeadership[];
  // Admin detection: treats any volunteer leading a ministry named 'Administration'
  // as a church-wide admin. This relies on the invariant that every church has
  // exactly one ministry with this exact name linked to the admin role. If the
  // ministry is renamed or a non-admin ministry is accidentally named
  // 'Administration', access grants/revocations will be silent.
  // TODO: replace with a DB-backed isAdmin column on volunteer or a
  // church.adminMinistryId FK so admin status is explicit and rename-proof.
  isAdmin: boolean;
}

async function resolveVolunteerContext(
  userId: string,
): Promise<ResolvedVolunteerContext> {
  const vol = await repositories.volunteers.findByUserIdGlobally(
    userId as UserId,
  );

  if (!vol) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Active volunteer profile not found',
    });
  }

  const ledMinistries = await repositories.volunteers.listLedMinistries(
    vol.churchId,
    vol.id,
  );

  const isAdmin = ledMinistries.some(
    (l) => l.ministryName === 'Administration',
  );

  return {
    volunteerId: vol.id,
    churchId: vol.churchId,
    ledMinistries,
    isAdmin,
  };
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
  const { volunteerId, churchId, ledMinistries, isAdmin } =
    await resolveVolunteerContext(userId);

  const isLeaderOfTarget = ledMinistries.some(
    (l) => l.ministryId === targetMinistryId,
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
    volunteerId,
    churchId,
    systemRole,
    ministryId: isLeaderOfTarget
      ? (targetMinistryId as MinistryId)
      : (ledMinistries.find((l) => l.ministryName === 'Administration')
          ?.ministryId ?? ''),
  };
}

/**
 * Authorizes read access to the schedule builder for a ministry. Unlike
 * {@link authorizeLeaderOrAdmin}, this also admits **sub-leaders** (team
 * leaders) and resolves their `teamId` so the caller can scope the builder to
 * the sub-leader's own team. Full leaders/admins get `teamId: null`.
 */
export async function authorizeScheduleBuilderAccess(
  userId: string,
  targetMinistryId: string,
): Promise<BuilderAccessContext> {
  const { volunteerId, churchId, ledMinistries, isAdmin } =
    await resolveVolunteerContext(userId);

  const isLeaderOfTarget = ledMinistries.some(
    (l) => l.ministryId === targetMinistryId,
  );

  // Sub-leadership is contextual: only check the membership row when the caller
  // is not already a full leader/admin (avoids an extra query on the hot path).
  let ownMembership: MinistryMembership | undefined;
  if (!isAdmin && !isLeaderOfTarget) {
    const memberships = await repositories.volunteers.listMinistryMemberships(
      churchId,
      targetMinistryId as MinistryId,
    );
    ownMembership = memberships.find((m) => m.volunteerId === volunteerId);
  }
  const isSubLeader = ownMembership?.systemRole === 'sub_leader';

  if (!isAdmin && !isLeaderOfTarget && !isSubLeader) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'User is not authorized to access this schedule builder',
    });
  }

  const systemRole: BuilderAccessRole = isAdmin
    ? 'admin'
    : isLeaderOfTarget
      ? 'leader'
      : 'sub_leader';

  return {
    volunteerId,
    churchId,
    systemRole,
    ministryId: targetMinistryId,
    teamId: isSubLeader ? (ownMembership?.teamId ?? null) : null,
  };
}
