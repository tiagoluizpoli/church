import { NotFoundError } from '@church/core';
import {
  availabilityCheck,
  church,
  cycle,
  event,
  ministry,
  ministryMembership,
  ministryParticipation,
  shift,
  user,
  volunteer,
} from '@church/db';
import { fromDate } from '@church/time';
import { and, eq, inArray } from 'drizzle-orm';
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
  MinistryLeaderRow,
} from '../../domain/contracts/infrastructure/availability-check.repository';
import type { AvailabilityCheck } from '../../domain/entities/availability-check';
import { mapAvailabilityCheck } from '../mappers/availability-check.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleAvailabilityCheckRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleAvailabilityCheckRepository
  implements AvailabilityCheckRepository
{
  constructor({ db }: DrizzleAvailabilityCheckRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listActiveMemberships(
    input: ListActiveMembershipsInput,
  ): Promise<ActiveMinistryMembership[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select({
        ministryMembershipId: ministryMembership.id,
        volunteerId: ministryMembership.volunteerId,
        volunteerName: user.name,
      })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          eq(ministryMembership.ministryId, input.ministryId),
          eq(ministryMembership.status, 'active'),
          withChurchIsolation(ministryMembership, input.churchId),
        ),
      );

    return rows.map((row) => ({
      ministryMembershipId: row.ministryMembershipId,
      volunteerId: row.volunteerId as VolunteerId,
      volunteerName: row.volunteerName,
    }));
  }

  async listByCycle(
    input: ListChecksByCycleInput,
  ): Promise<AvailabilityCheck[]> {
    const db = getClient(this.db, input.tx);
    const conditions = [
      eq(availabilityCheck.cycleId, input.cycleId),
      withChurchIsolation(availabilityCheck, input.churchId),
    ];

    if (input.ministryMembershipIds && input.ministryMembershipIds.length > 0) {
      conditions.push(
        inArray(
          availabilityCheck.ministryMembershipId,
          input.ministryMembershipIds,
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
          cycleId: check.cycleId,
          ministryMembershipId: check.ministryMembershipId,
        })),
      )
      .onConflictDoNothing()
      .returning();

    return rows.map(mapAvailabilityCheck);
  }

  private contextSelection() {
    return {
      check: availabilityCheck,
      volunteerId: ministryMembership.volunteerId,
      ministryId: ministryMembership.ministryId,
      ministryName: ministry.name,
      cycleName: cycle.name,
      timeZone: church.timezone,
    };
  }

  async getCheckContext(input: GetCheckContextInput): Promise<CheckContext> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select(this.contextSelection())
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .innerJoin(cycle, eq(cycle.id, availabilityCheck.cycleId))
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
      cycleName: row.cycleName,
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
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .innerJoin(cycle, eq(cycle.id, availabilityCheck.cycleId))
      .innerJoin(church, eq(church.id, availabilityCheck.churchId))
      .where(
        and(
          eq(ministryMembership.volunteerId, input.volunteerId),
          withChurchIsolation(availabilityCheck, input.churchId),
        ),
      );

    return rows.map((row) => ({
      check: mapAvailabilityCheck(row.check),
      volunteerId: row.volunteerId as VolunteerId,
      ministryId: row.ministryId as MinistryId,
      ministryName: row.ministryName,
      cycleName: row.cycleName,
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
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.ministryId, ministryMembership.ministryId),
      )
      .innerJoin(
        event,
        and(
          eq(event.id, ministryParticipation.eventId),
          eq(event.cycleId, availabilityCheck.cycleId),
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
      startTime: fromDate({ date: row.startTime }),
      endTime: fromDate({ date: row.endTime }),
      label: row.label ?? undefined,
    }));
  }

  async listMinistryLeaderVolunteerIds(
    input: ListMinistryLeaderVolunteerIdsInput,
  ): Promise<MinistryLeaderRow[]> {
    if (input.ministryIds.length === 0) return [];

    const db = getClient(this.db, input.tx);
    const rows = await db
      .select({
        ministryId: ministryMembership.ministryId,
        volunteerId: ministryMembership.volunteerId,
      })
      .from(ministryMembership)
      .where(
        and(
          inArray(ministryMembership.ministryId, input.ministryIds),
          eq(ministryMembership.ministryAccessLevel, 'leader'),
          eq(ministryMembership.status, 'active'),
          withChurchIsolation(ministryMembership, input.churchId),
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
