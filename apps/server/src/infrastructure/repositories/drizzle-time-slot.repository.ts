import { NotFoundError } from '@church/core';
import { assignment, slotRequirement, timeSlot } from '@church/db';
import { and, count, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { RoleId } from '../../domain/entities/role';
import type { SlotRequirement } from '../../domain/entities/slot-requirement';
import type { TimeSlot, TimeSlotId } from '../../domain/entities/time-slot';
import type {
  BulkCreateTimeSlotsInput,
  CreateTimeSlotInput,
  TimeSlotRepository,
  UpdateTimeSlotInput,
  UpsertSlotRequirementInput,
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

  async create(
    churchId: ChurchId,
    input: CreateTimeSlotInput,
    tx?: TransactionContext,
  ): Promise<TimeSlot> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .insert(timeSlot)
      .values({
        churchId,
        eventId: input.eventId,
        startTime: input.startTime,
        endTime: input.endTime,
        label: input.label ?? null,
      })
      .returning();
    if (!row) throw new Error('TimeSlot insert failed');
    return mapTimeSlot(row, []);
  }

  async update(
    churchId: ChurchId,
    id: TimeSlotId,
    input: UpdateTimeSlotInput,
    tx?: TransactionContext,
  ): Promise<TimeSlot> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .update(timeSlot)
      .set({
        ...(input.startTime !== undefined
          ? { startTime: input.startTime }
          : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.label !== undefined ? { label: input.label ?? null } : {}),
      })
      .where(and(eq(timeSlot.id, id), withChurchIsolation(timeSlot, churchId)))
      .returning();
    if (!row) throw new NotFoundError(`TimeSlot not found: ${id}`);
    return this.fetchWithRequirements(db, row);
  }

  async deleteById(
    churchId: ChurchId,
    id: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(timeSlot)
      .where(and(eq(timeSlot.id, id), withChurchIsolation(timeSlot, churchId)));
  }

  async findOverlapping(
    churchId: ChurchId,
    eventId: EventId,
    startTime: Date,
    endTime: Date,
    excludeSlotId?: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<TimeSlot[]> {
    const db = getClient(this.db, tx);
    const conditions = [
      withChurchIsolation(timeSlot, churchId),
      eq(timeSlot.eventId, eventId),
      // overlap: existing.start < new.end AND existing.end > new.start
      lt(timeSlot.startTime, endTime),
      gt(timeSlot.endTime, startTime),
    ];
    if (excludeSlotId) conditions.push(ne(timeSlot.id, excludeSlotId));
    const rows = await db
      .select()
      .from(timeSlot)
      .where(and(...conditions));
    return rows.map((r) => mapTimeSlot(r, []));
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

  async upsertRequirement(
    churchId: ChurchId,
    slotId: TimeSlotId,
    input: UpsertSlotRequirementInput,
    tx?: TransactionContext,
  ): Promise<SlotRequirement> {
    const db = getClient(this.db, tx);
    const [existing] = await db
      .select()
      .from(slotRequirement)
      .where(
        and(
          eq(slotRequirement.slotId, slotId),
          eq(slotRequirement.roleId, input.roleId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(slotRequirement)
        .set({ requiredCount: input.requiredCount })
        .where(eq(slotRequirement.id, existing.id))
        .returning();
      if (!updated) throw new Error('SlotRequirement update failed');
      return mapSlotRequirement(updated);
    }

    const [inserted] = await db
      .insert(slotRequirement)
      .values({
        churchId,
        slotId,
        roleId: input.roleId,
        teamId: input.teamId ?? null,
        requiredCount: input.requiredCount,
        notes: input.notes ?? null,
      })
      .returning();
    if (!inserted) throw new Error('SlotRequirement insert failed');
    return mapSlotRequirement(inserted);
  }

  async countActiveAssignments(
    churchId: ChurchId,
    slotId: TimeSlotId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<number> {
    const db = getClient(this.db, tx);
    const [result] = await db
      .select({ cnt: count() })
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(assignment.slotId, slotId),
          eq(assignment.roleId, roleId),
          inArray(assignment.status, ['pending', 'confirmed']),
        ),
      );
    return result?.cnt ?? 0;
  }
}
