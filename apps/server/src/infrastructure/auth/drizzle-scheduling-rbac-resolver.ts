import {
  ministryParticipation,
  ministryVolunteer,
  shift,
  volunteer,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import type { MinistryId } from '../../domain/branded-ids';
import type {
  IsChurchAdminInput,
  IsMinistryLeaderInput,
  ResolveParticipationMinistryInput,
  ResolveShiftMinistryInput,
  SchedulingScopeRepository,
} from '../../domain/contracts/infrastructure/scheduling-scope.repository';
import { isChurchAdminMember, isValidUuid } from '../repositories/helpers';
import type { AnyDrizzleDb } from '../repositories/types';

export class DrizzleSchedulingRbacResolver
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

  async isChurchAdmin(input: IsChurchAdminInput): Promise<boolean> {
    return isChurchAdminMember(this.db, input.churchId, input.userId);
  }

  async isMinistryLeader(input: IsMinistryLeaderInput): Promise<boolean> {
    const [leader] = await this.db
      .select({ id: ministryVolunteer.id })
      .from(volunteer)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.volunteerId, volunteer.id),
      )
      .where(
        and(
          eq(volunteer.userId, input.userId),
          eq(volunteer.churchId, input.churchId),
          eq(ministryVolunteer.churchId, input.churchId),
          eq(ministryVolunteer.ministryId, input.ministryId),
          eq(ministryVolunteer.ministryAccessLevel, 'leader'),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .limit(1);
    return leader != null;
  }
}
