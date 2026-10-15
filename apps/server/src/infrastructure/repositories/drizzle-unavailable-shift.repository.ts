import {
  availability,
  availabilityCheck,
  eventTimeBlock,
  ministryMembership,
  shift,
} from '@church/db';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { ChurchId, EventId, VolunteerId } from '../../domain/branded-ids';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  ListUnavailableShiftsByCheckInput,
  ReplaceUnavailableShiftsForCheckInput,
  UnavailableShiftRepository,
} from '../../domain/contracts/infrastructure/unavailable-shift.repository';
import type { Availability } from '../../domain/entities/unavailable-shift';
import { mapUnavailableShift } from '../mappers/unavailable-shift.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleUnavailableShiftRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleUnavailableShiftRepository
  implements UnavailableShiftRepository
{
  constructor({ db }: DrizzleUnavailableShiftRepositoryInput) {
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
        volunteerId: ministryMembership.volunteerId,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
      })
      .from(availability)
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, availability.availabilityCheckId),
      )
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(shift, eq(shift.id, availability.shiftId))
      .where(and(withChurchIsolation(availability, churchId), ...conditions));
    return rows.map((row) => mapUnavailableShift(row.availability, row));
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
        volunteerId: ministryMembership.volunteerId,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
      })
      .from(availability)
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, availability.availabilityCheckId),
      )
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(shift, eq(shift.id, availability.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .where(
        and(
          withChurchIsolation(availability, churchId),
          eq(ministryMembership.volunteerId, volunteerId),
          eq(eventTimeBlock.eventId, eventId),
        ),
      );
    return rows.map((row) => mapUnavailableShift(row.availability, row));
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    if (volunteerIds.length === 0) return [];
    return this.rows(
      churchId,
      [inArray(ministryMembership.volunteerId, volunteerIds)],
      tx,
    );
  }

  async listUnavailableShiftsByCheck(
    input: ListUnavailableShiftsByCheckInput,
  ): Promise<Availability[]> {
    return this.rows(
      input.churchId,
      [eq(availability.availabilityCheckId, input.availabilityCheckId)],
      input.tx,
    );
  }

  async replaceUnavailableShiftsForCheck(
    input: ReplaceUnavailableShiftsForCheckInput,
  ): Promise<void> {
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
