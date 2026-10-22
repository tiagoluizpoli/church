import {
  availabilityCheck,
  eventTimeBlock,
  ministryMembership,
  shift,
  unavailableShift,
} from '@church/db';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { ChurchId, EventId, VolunteerId } from '../../domain/branded-ids';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  ListUnavailableShiftsByCheckInput,
  ReplaceUnavailableShiftsForCheckInput,
  UnavailableShiftRepository,
} from '../../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnavailableShift } from '../../domain/entities/unavailable-shift';
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
  ): Promise<UnavailableShift[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({
        unavailableShift,
        volunteerId: ministryMembership.volunteerId,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
      })
      .from(unavailableShift)
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, unavailableShift.availabilityCheckId),
      )
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(shift, eq(shift.id, unavailableShift.shiftId))
      .where(
        and(
          withChurchIsolation({ table: unavailableShift, churchId }),
          ...conditions,
        ),
      );
    return rows.map((row) =>
      mapUnavailableShift({ row: row.unavailableShift, joined: row }),
    );
  }

  async listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<UnavailableShift[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({
        unavailableShift,
        volunteerId: ministryMembership.volunteerId,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
      })
      .from(unavailableShift)
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, unavailableShift.availabilityCheckId),
      )
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(shift, eq(shift.id, unavailableShift.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .where(
        and(
          withChurchIsolation({ table: unavailableShift, churchId }),
          eq(ministryMembership.volunteerId, volunteerId),
          eq(eventTimeBlock.eventId, eventId),
        ),
      );
    return rows.map((row) =>
      mapUnavailableShift({ row: row.unavailableShift, joined: row }),
    );
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<UnavailableShift[]> {
    if (volunteerIds.length === 0) return [];
    return this.rows(
      churchId,
      [inArray(ministryMembership.volunteerId, volunteerIds)],
      tx,
    );
  }

  async listUnavailableShiftsByCheck(
    input: ListUnavailableShiftsByCheckInput,
  ): Promise<UnavailableShift[]> {
    return this.rows(
      input.churchId,
      [eq(unavailableShift.availabilityCheckId, input.availabilityCheckId)],
      input.tx,
    );
  }

  async replaceUnavailableShiftsForCheck(
    input: ReplaceUnavailableShiftsForCheckInput,
  ): Promise<void> {
    const client = getClient({ db: this.db, tx: input.tx });
    await client.delete(unavailableShift).where(
      and(
        withChurchIsolation({
          table: unavailableShift,
          churchId: input.churchId,
        }),
        eq(unavailableShift.availabilityCheckId, input.availabilityCheckId),
      ),
    );

    if (input.shiftIds.length === 0) return;

    await client.insert(unavailableShift).values(
      input.shiftIds.map((shiftId) => ({
        churchId: input.churchId,
        availabilityCheckId: input.availabilityCheckId,
        shiftId,
      })),
    );
  }
}
