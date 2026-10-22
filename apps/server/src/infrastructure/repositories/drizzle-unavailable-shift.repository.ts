import {
  availabilityCheck,
  eventTimeBlock,
  ministryMembership,
  shift,
  unavailableShift,
} from '@church/db';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { ChurchId } from '../../domain/branded-ids';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  ListUnavailableShiftsByCheckInput,
  ListUnavailableShiftsByVolunteerForEventInput,
  ListUnavailableShiftsByVolunteersInput,
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

interface RowsInput {
  churchId: ChurchId;
  conditions: SQL[];
  tx?: TransactionContext;
}

export class DrizzleUnavailableShiftRepository
  implements UnavailableShiftRepository
{
  constructor({ db }: DrizzleUnavailableShiftRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async rows({
    churchId,
    conditions,
    tx,
  }: RowsInput): Promise<UnavailableShift[]> {
    const rows = await getClient(this.db, tx)
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
        and(withChurchIsolation(unavailableShift, churchId), ...conditions),
      );
    return rows.map((row) => mapUnavailableShift(row.unavailableShift, row));
  }

  async listByVolunteerForEvent({
    churchId,
    volunteerId,
    eventId,
    tx,
  }: ListUnavailableShiftsByVolunteerForEventInput): Promise<
    UnavailableShift[]
  > {
    const rows = await getClient(this.db, tx)
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
          withChurchIsolation(unavailableShift, churchId),
          eq(ministryMembership.volunteerId, volunteerId),
          eq(eventTimeBlock.eventId, eventId),
        ),
      );
    return rows.map((row) => mapUnavailableShift(row.unavailableShift, row));
  }

  async listByVolunteers({
    churchId,
    volunteerIds,
    tx,
  }: ListUnavailableShiftsByVolunteersInput): Promise<UnavailableShift[]> {
    if (volunteerIds.length === 0) return [];
    return this.rows({
      churchId,
      conditions: [inArray(ministryMembership.volunteerId, volunteerIds)],
      tx,
    });
  }

  async listUnavailableShiftsByCheck(
    input: ListUnavailableShiftsByCheckInput,
  ): Promise<UnavailableShift[]> {
    return this.rows({
      churchId: input.churchId,
      conditions: [
        eq(unavailableShift.availabilityCheckId, input.availabilityCheckId),
      ],
      tx: input.tx,
    });
  }

  async replaceUnavailableShiftsForCheck(
    input: ReplaceUnavailableShiftsForCheckInput,
  ): Promise<void> {
    const client = getClient(this.db, input.tx);
    await client
      .delete(unavailableShift)
      .where(
        and(
          withChurchIsolation(unavailableShift, input.churchId),
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
