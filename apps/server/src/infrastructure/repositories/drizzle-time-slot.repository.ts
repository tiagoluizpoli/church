import { NotFoundError } from '@church/core';
import { slotRequirement, timeSlot } from '@church/db';
import { and, eq } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { TimeSlot, TimeSlotId } from '../../domain/entities/time-slot';
import type {
  BulkCreateTimeSlotsInput,
  TimeSlotRepository,
} from '../../domain/repositories/time-slot.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import { mapSlotRequirement, mapTimeSlot } from './mappers';
import type { AnyDrizzleDb } from './types';

export class DrizzleTimeSlotRepository implements TimeSlotRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  private async fetchWithRequirements(
    db: AnyDrizzleDb,
    slotRow: typeof timeSlot.$inferSelect,
  ): Promise<TimeSlot> {
    const reqRows = await db
      .select()
      .from(slotRequirement)
      .where(eq(slotRequirement.slotId, slotRow.id));
    return mapTimeSlot(slotRow, reqRows.map(mapSlotRequirement));
  }

  async getById(
    churchId: ChurchId,
    id: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<TimeSlot> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`TimeSlot not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(timeSlot)
      .where(and(eq(timeSlot.id, id), withChurchIsolation(timeSlot, churchId)));
    if (!row) throw new NotFoundError(`TimeSlot not found: ${id}`);
    return this.fetchWithRequirements(db, row);
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<TimeSlot[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select()
      .from(timeSlot)
      .where(
        and(
          eq(timeSlot.eventId, eventId),
          withChurchIsolation(timeSlot, churchId),
        ),
      );
    return Promise.all(rows.map((r) => this.fetchWithRequirements(db, r)));
  }

  async bulkCreate(
    churchId: ChurchId,
    input: BulkCreateTimeSlotsInput,
    tx?: TransactionContext,
  ): Promise<TimeSlot[]> {
    const db = getClient(this.db, tx);
    const result: TimeSlot[] = [];
    for (const slotInput of input.slots) {
      const [slotRow] = await db
        .insert(timeSlot)
        .values({
          churchId,
          eventId: input.eventId,
          startTime: slotInput.startTime,
          endTime: slotInput.endTime,
          label: slotInput.label ?? null,
        })
        .returning();
      if (!slotRow) throw new Error('TimeSlot insert failed');

      const requirements = [];
      if (slotInput.requirements?.length) {
        const reqRows = await db
          .insert(slotRequirement)
          .values(
            slotInput.requirements.map((r) => ({
              churchId,
              slotId: slotRow.id,
              roleId: r.roleId,
              teamId: r.teamId ?? null,
              requiredCount: r.requiredCount,
              notes: r.notes ?? null,
            })),
          )
          .returning();
        requirements.push(...reqRows.map(mapSlotRequirement));
      }

      result.push(mapTimeSlot(slotRow, requirements));
    }
    return result;
  }

  async deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(timeSlot)
      .where(
        and(
          eq(timeSlot.eventId, eventId),
          withChurchIsolation(timeSlot, churchId),
        ),
      );
  }
}
