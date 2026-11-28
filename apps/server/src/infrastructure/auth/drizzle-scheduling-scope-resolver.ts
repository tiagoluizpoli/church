import {
  member,
  ministry,
  ministryMembership,
  ministryParticipation,
  shift,
  volunteer,
} from '@church/db';
import { and, asc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import type { ChurchAccessLevel } from '../../domain/authority/types';
import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import type {
  ListSchedulingScopesInput,
  ResolveParticipationMinistryInput,
  ResolveShiftMinistryInput,
  SchedulingScope,
  SchedulingScopeRepository,
} from '../../domain/contracts/infrastructure/scheduling-scope.repository';
import type { AnyDrizzleDb } from '../repositories/drizzle-db.types';
import { isValidUuid, withActiveVolunteer } from '../repositories/helpers';
import type { DrizzleSchedulingScopeResolverInput } from './drizzle-scheduling-scope-resolver.types';

/**
 * Resolves the owning Ministry for a Participation or Shift, so callers can
 * hand the result to `AuthorityService` as a `MinistryResource`, and a User's
 * scheduling scope across Churches. Supersedes
 * `DrizzleSchedulingRbacResolver` for callers migrated onto AuthorityService
 * — the admin/leader decision it used to make (`isChurchAdmin`,
 * `isMinistryLeader`) now lives entirely in `AuthorityService`.
 */
export class DrizzleSchedulingScopeResolver
  implements SchedulingScopeRepository
{
  constructor({ db }: DrizzleSchedulingScopeResolverInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async resolveParticipationMinistry(
    input: ResolveParticipationMinistryInput,
  ): Promise<MinistryId | null> {
    if (!isValidUuid(input.participationId)) return null;
    const [row] = await this.db
      .select({ ministryId: ministryParticipation.ministryId })
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          eq(ministryParticipation.churchId, input.churchId),
        ),
      )
      .limit(1);
    return (row?.ministryId as MinistryId | undefined) ?? null;
  }

  async resolveShiftMinistry(
    input: ResolveShiftMinistryInput,
  ): Promise<MinistryId | null> {
    if (!isValidUuid(input.shiftId)) return null;
    const [row] = await this.db
      .select({ ministryId: ministryParticipation.ministryId })
      .from(shift)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .where(
        and(
          eq(shift.id, input.shiftId),
          eq(shift.churchId, input.churchId),
          eq(ministryParticipation.churchId, input.churchId),
        ),
      )
      .limit(1);
    return (row?.ministryId as MinistryId | undefined) ?? null;
  }

  async listSchedulingScopes(
    input: ListSchedulingScopesInput,
  ): Promise<SchedulingScope[]> {
    const { userId, churchIds } = input;
    // Leadership as `DrizzleAuthorityActorResolver` reads it: an active profile
    // and membership; an archived Ministry grants none.
    const ledMemberships = this.db
      .select({ id: ministryMembership.id })
      .from(volunteer)
      .innerJoin(
        ministryMembership,
        and(
          eq(ministryMembership.volunteerId, volunteer.id),
          eq(ministryMembership.churchId, volunteer.churchId),
        ),
      )
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          eq(volunteer.userId, member.userId),
          eq(volunteer.churchId, member.organizationId),
          withActiveVolunteer(volunteer),
          eq(ministryMembership.status, 'active'),
          eq(ministryMembership.ministryAccessLevel, 'leader'),
          isNull(ministry.deletedAt),
        ),
      );
    const rows = await this.db
      .select({
        churchId: member.organizationId,
        role: member.role,
        leadsMinistry: sql<boolean>`${exists(ledMemberships)}`,
      })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          inArray(member.organizationId, churchIds),
        ),
      )
      .orderBy(asc(member.organizationId), asc(member.id));
    return rows.map((row) => ({
      churchId: row.churchId as ChurchId,
      churchAccessLevel: row.role as ChurchAccessLevel,
      leadsMinistry: row.leadsMinistry,
    }));
  }
}
