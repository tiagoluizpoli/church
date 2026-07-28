import { NotFoundError } from '@church/core';
import {
  availability,
  availabilityCheck,
  church,
  event,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  planningCycle,
  shift,
  user,
  volunteer,
} from '@church/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type {
  EventId,
  MinistryId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  ActiveMinistryMembership,
  AvailabilityCheckRepository,
  CheckContext,
  CheckShiftRow,
  ConfirmCheckInput,
  CreateChecksInput,
  GetCheckContextInput,
  ListActiveMembershipsInput,
  ListCheckShiftsInput,
  ListChecksByCycleInput,
  ListChecksByVolunteerInput,
  ListMinistryLeaderVolunteerIdsInput,
  ListUnmarkedVolunteerShiftsInput,
  MinistryLeaderRow,
  UnmarkedVolunteerShiftRow,
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
        volunteerName: user.name,
      })
      .from(ministryVolunteer)
      .innerJoin(volunteer, eq(volunteer.id, ministryVolunteer.volunteerId))
      .innerJoin(user, eq(user.id, volunteer.userId))
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
      volunteerName: row.volunteerName,
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

  private contextSelection() {
    return {
      check: availabilityCheck,
      volunteerId: ministryVolunteer.volunteerId,
      ministryId: ministryVolunteer.ministryId,
      ministryName: ministry.name,
      planningCycleName: planningCycle.name,
      timeZone: church.timezone,
    };
  }

  async getCheckContext(input: GetCheckContextInput): Promise<CheckContext> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select(this.contextSelection())
      .from(availabilityCheck)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, availabilityCheck.ministryVolunteerId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryVolunteer.ministryId))
      .innerJoin(
        planningCycle,
        eq(planningCycle.id, availabilityCheck.planningCycleId),
      )
      .innerJoin(church, eq(church.id, availabilityCheck.churchId))
      .where(
        and(
          eq(availabilityCheck.id, input.checkId),
          withChurchIsolation(availabilityCheck, input.churchId),
        ),
      );

    const row = rows[0];
    if (!row) {
      throw new NotFoundError(`Availability check not found: ${input.checkId}`);
    }

    return {
      check: mapAvailabilityCheck(row.check),
      volunteerId: row.volunteerId as VolunteerId,
      ministryId: row.ministryId as MinistryId,
      ministryName: row.ministryName,
      planningCycleName: row.planningCycleName,
      timeZone: row.timeZone,
    };
  }

  async listByVolunteer(
    input: ListChecksByVolunteerInput,
  ): Promise<CheckContext[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select(this.contextSelection())
      .from(availabilityCheck)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, availabilityCheck.ministryVolunteerId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryVolunteer.ministryId))
      .innerJoin(
        planningCycle,
        eq(planningCycle.id, availabilityCheck.planningCycleId),
      )
      .innerJoin(church, eq(church.id, availabilityCheck.churchId))
      .where(
        and(
          eq(ministryVolunteer.volunteerId, input.volunteerId),
          withChurchIsolation(availabilityCheck, input.churchId),
        ),
      );

    return rows.map((row) => ({
      check: mapAvailabilityCheck(row.check),
      volunteerId: row.volunteerId as VolunteerId,
      ministryId: row.ministryId as MinistryId,
      ministryName: row.ministryName,
      planningCycleName: row.planningCycleName,
      timeZone: row.timeZone,
    }));
  }

  async listCheckShifts(input: ListCheckShiftsInput): Promise<CheckShiftRow[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select({
        shiftId: shift.id,
        eventId: event.id,
        eventTitle: event.title,
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: shift.label,
      })
      .from(availabilityCheck)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, availabilityCheck.ministryVolunteerId),
      )
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.ministryId, ministryVolunteer.ministryId),
      )
      .innerJoin(
        event,
        and(
          eq(event.id, ministryParticipation.eventId),
          eq(event.planningCycleId, availabilityCheck.planningCycleId),
        ),
      )
      .innerJoin(shift, eq(shift.participationId, ministryParticipation.id))
      .where(
        and(
          eq(availabilityCheck.id, input.checkId),
          withChurchIsolation(availabilityCheck, input.churchId),
        ),
      )
      .orderBy(shift.startTime);

    return rows.map((row) => ({
      shiftId: row.shiftId as ShiftId,
      eventId: row.eventId as EventId,
      eventTitle: row.eventTitle,
      startTime: row.startTime,
      endTime: row.endTime,
      label: row.label ?? undefined,
    }));
  }

  async listUnmarkedVolunteerShifts(
    input: ListUnmarkedVolunteerShiftsInput,
  ): Promise<UnmarkedVolunteerShiftRow[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select({
        shiftId: shift.id,
        ministryId: ministryVolunteer.ministryId,
        startTime: shift.startTime,
        endTime: shift.endTime,
      })
      .from(availabilityCheck)
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, availabilityCheck.ministryVolunteerId),
      )
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.ministryId, ministryVolunteer.ministryId),
      )
      .innerJoin(
        event,
        and(
          eq(event.id, ministryParticipation.eventId),
          eq(event.planningCycleId, availabilityCheck.planningCycleId),
        ),
      )
      .innerJoin(shift, eq(shift.participationId, ministryParticipation.id))
      .leftJoin(
        availability,
        and(
          eq(availability.availabilityCheckId, availabilityCheck.id),
          eq(availability.shiftId, shift.id),
        ),
      )
      .where(
        and(
          eq(ministryVolunteer.volunteerId, input.volunteerId),
          eq(availabilityCheck.planningCycleId, input.planningCycleId),
          withChurchIsolation(availabilityCheck, input.churchId),
          isNull(availability.id),
        ),
      );

    return rows.map((row) => ({
      shiftId: row.shiftId as ShiftId,
      ministryId: row.ministryId as MinistryId,
      startTime: row.startTime,
      endTime: row.endTime,
    }));
  }

  async listMinistryLeaderVolunteerIds(
    input: ListMinistryLeaderVolunteerIdsInput,
  ): Promise<MinistryLeaderRow[]> {
    if (input.ministryIds.length === 0) return [];

    const db = getClient(this.db, input.tx);
    const rows = await db
      .select({
        ministryId: ministryVolunteer.ministryId,
        volunteerId: ministryVolunteer.volunteerId,
      })
      .from(ministryVolunteer)
      .where(
        and(
          inArray(ministryVolunteer.ministryId, input.ministryIds),
          eq(ministryVolunteer.ministryAccessLevel, 'leader'),
          eq(ministryVolunteer.status, 'active'),
          withChurchIsolation(ministryVolunteer, input.churchId),
        ),
      );

    return rows.map((row) => ({
      ministryId: row.ministryId as MinistryId,
      volunteerId: row.volunteerId as VolunteerId,
    }));
  }

  async confirm(input: ConfirmCheckInput): Promise<void> {
    const db = getClient(this.db, input.tx);
    await db
      .update(availabilityCheck)
      .set({ state: 'confirmed', confirmedAt: input.confirmedAt })
      .where(
        and(
          eq(availabilityCheck.id, input.checkId),
          withChurchIsolation(availabilityCheck, input.churchId),
        ),
      );
  }
}
