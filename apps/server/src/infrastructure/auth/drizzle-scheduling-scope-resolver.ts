import { ministryParticipation, shift } from '@church/db';
import { and, eq } from 'drizzle-orm';
import type { MinistryId } from '../../domain/branded-ids';
import type {
  ResolveParticipationMinistryInput,
  ResolveShiftMinistryInput,
  SchedulingScopeRepository,
} from '../../domain/contracts/infrastructure/scheduling-scope.repository';
import { isValidUuid } from '../repositories/helpers';
import type { AnyDrizzleDb } from '../repositories/types';

/**
 * Resolves the owning Ministry for a Participation or Shift, so callers can
 * hand the result to `AuthorityService` as a `MinistryResource`. Supersedes
 * `DrizzleSchedulingRbacResolver` for callers migrated onto AuthorityService
 * — the admin/leader decision it used to make (`isChurchAdmin`,
 * `isMinistryLeader`) now lives entirely in `AuthorityService`.
 */
export class DrizzleSchedulingScopeResolver
  implements SchedulingScopeRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

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
}
