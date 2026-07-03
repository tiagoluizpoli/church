import { availabilityCheck, ministryVolunteer } from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { VolunteerId } from '../../domain/branded-ids';
import type {
  ActiveMinistryMembership,
  AvailabilityCheckRepository,
  CreateChecksInput,
  ListActiveMembershipsInput,
  ListChecksByCycleInput,
} from '../../domain/contracts/infrastructure/availability-check.repository';
import type { AvailabilityCheck } from '../../domain/entities/availability-check';
import { mapAvailabilityCheck } from '../mappers/availability-check.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAvailabilityCheckRepository
  implements AvailabilityCheckRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

  async listActiveMemberships(
    input: ListActiveMembershipsInput,
  ): Promise<ActiveMinistryMembership[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select({
        ministryVolunteerId: ministryVolunteer.id,
        volunteerId: ministryVolunteer.volunteerId,
      })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.ministryId, input.ministryId),
          eq(ministryVolunteer.status, 'active'),
          withChurchIsolation(ministryVolunteer, input.churchId),
        ),
      );

    return rows.map((row) => ({
      ministryVolunteerId: row.ministryVolunteerId,
      volunteerId: row.volunteerId as VolunteerId,
    }));
  }

  async listByCycle(
    input: ListChecksByCycleInput,
  ): Promise<AvailabilityCheck[]> {
    const db = getClient(this.db, input.tx);
    const conditions = [
      eq(availabilityCheck.planningCycleId, input.planningCycleId),
      withChurchIsolation(availabilityCheck, input.churchId),
    ];

    if (input.ministryVolunteerIds && input.ministryVolunteerIds.length > 0) {
      conditions.push(
        inArray(
          availabilityCheck.ministryVolunteerId,
          input.ministryVolunteerIds,
        ),
      );
    }

    const rows = await db
      .select()
      .from(availabilityCheck)
      .where(and(...conditions));

    return rows.map(mapAvailabilityCheck);
  }

  async createMany(input: CreateChecksInput): Promise<AvailabilityCheck[]> {
    if (input.checks.length === 0) {
      return [];
    }

    const db = getClient(this.db, input.tx);
    const rows = await db
      .insert(availabilityCheck)
      .values(
        input.checks.map((check) => ({
          churchId: input.churchId,
          planningCycleId: check.planningCycleId,
          ministryVolunteerId: check.ministryVolunteerId,
        })),
      )
      .onConflictDoNothing()
      .returning();

    return rows.map(mapAvailabilityCheck);
  }
}
