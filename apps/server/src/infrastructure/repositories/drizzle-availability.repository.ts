import { NotFoundError } from '@church/core';
import {
  availability,
  availabilityCheck,
  ministryVolunteer,
  shift,
  timeSlot,
} from '@church/db';
import { and, between, eq, inArray, type SQL } from 'drizzle-orm';
import type {
  AvailabilityId,
  ChurchId,
  EventId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  AvailabilityRepository,
  CreateAvailabilityInput,
  UpdateAvailabilityInput,
} from '../../domain/contracts/infrastructure/availability.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { Availability } from '../../domain/entities/availability';
import { mapAvailability } from '../mappers/availability.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  private async rows(
    churchId: ChurchId,
    conditions: SQL[],
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    const rows = await getClient(this.db, tx)
      .select({
        availability,
        volunteerId: ministryVolunteer.volunteerId,
        eventId: timeSlot.eventId,
        startTime: shift.startTime,
        endTime: shift.endTime,
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
      .where(and(withChurchIsolation(availability, churchId), ...conditions));
    return rows.map((row) => mapAvailability(row.availability, row));
  }

  async getById(
    churchId: ChurchId,
    id: AvailabilityId,
    tx?: TransactionContext,
  ): Promise<Availability> {
    const rows = await this.rows(churchId, [eq(availability.id, id)], tx);
    const row = rows[0];
    if (!row) throw new NotFoundError(`Availability entry not found: ${id}`);
    return row;
  }

  listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    return this.rows(
      churchId,
      [
        eq(ministryVolunteer.volunteerId, volunteerId),
        between(shift.startTime, startTime, endTime),
      ],
      tx,
    );
  }

  listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    return this.rows(
      churchId,
      [
        eq(ministryVolunteer.volunteerId, volunteerId),
        eq(timeSlot.eventId, eventId),
      ],
      tx,
    );
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

  async create(
    _churchId: ChurchId,
    _input: CreateAvailabilityInput,
    _tx?: TransactionContext,
  ): Promise<Availability> {
    throw new Error('Legacy free-span availability writes are removed');
  }

  async update(
    _churchId: ChurchId,
    _id: AvailabilityId,
    _input: UpdateAvailabilityInput,
    _tx?: TransactionContext,
  ): Promise<void> {
    throw new Error('Legacy free-span availability writes are removed');
  }

  async delete(
    churchId: ChurchId,
    id: AvailabilityId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(availability)
      .where(
        and(
          eq(availability.id, id),
          withChurchIsolation(availability, churchId),
        ),
      );
  }
}
