import {
  availability,
  availabilityCheck,
  ministryVolunteer,
  shift,
  timeSlot,
} from '@church/db';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { ChurchId, EventId, VolunteerId } from '../../domain/branded-ids';
import type {
  AvailabilityRepository,
  ListMarksByCheckInput,
  ReplaceMarksForCheckInput,
} from '../../domain/contracts/infrastructure/availability.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { Availability } from '../../domain/entities/availability';
import { mapAvailability } from '../mappers/availability.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleAvailabilityRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleAvailabilityRepository implements AvailabilityRepository {
  constructor({ db }: DrizzleAvailabilityRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async rows(
    churchId: ChurchId,
    conditions: SQL[],
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    const rows = await getClient(this.db, tx)
      .select({
        availability,
        volunteerId: ministryVolunteer.volunteerId,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
      })
      .from(availability)
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, availability.availabilityCheckId),
      )
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, availabilityCheck.ministryVolunteerId),
      )
      .innerJoin(shift, eq(shift.id, availability.shiftId))
      .where(and(withChurchIsolation(availability, churchId), ...conditions));
    return rows.map((row) => mapAvailability(row.availability, row));
  }

  async listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    const rows = await getClient(this.db, tx)
      .select({
        availability,
        volunteerId: ministryVolunteer.volunteerId,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
      })
      .from(availability)
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, availability.availabilityCheckId),
      )
      .innerJoin(
        ministryVolunteer,
        eq(ministryVolunteer.id, availabilityCheck.ministryVolunteerId),
      )
      .innerJoin(shift, eq(shift.id, availability.shiftId))
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
      .where(
        and(
          withChurchIsolation(availability, churchId),
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(timeSlot.eventId, eventId),
        ),
      );
    return rows.map((row) => mapAvailability(row.availability, row));
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    if (volunteerIds.length === 0) return [];
    return this.rows(
      churchId,
      [inArray(ministryVolunteer.volunteerId, volunteerIds)],
      tx,
    );
  }

  async listMarksByCheck(
    input: ListMarksByCheckInput,
  ): Promise<Availability[]> {
    return this.rows(
      input.churchId,
      [eq(availability.availabilityCheckId, input.availabilityCheckId)],
      input.tx,
    );
  }

  async replaceMarksForCheck(input: ReplaceMarksForCheckInput): Promise<void> {
    const client = getClient(this.db, input.tx);
    await client
      .delete(availability)
      .where(
        and(
          withChurchIsolation(availability, input.churchId),
          eq(availability.availabilityCheckId, input.availabilityCheckId),
        ),
      );

    if (input.shiftIds.length === 0) return;

    await client.insert(availability).values(
      input.shiftIds.map((shiftId) => ({
        churchId: input.churchId,
        availabilityCheckId: input.availabilityCheckId,
        shiftId,
      })),
    );
  }
}
