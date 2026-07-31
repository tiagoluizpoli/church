import { NotFoundError } from '@church/core';
import {
  assignment,
  ministryParticipation,
  shift,
  slotRequirement,
  timeSlot,
} from '@church/db';
import { and, count, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type {
  ChurchId,
  EventId,
  RoleId,
  TimeSlotId,
} from '../../domain/branded-ids';
import type {
  BulkCreateTimeSlotsInput,
  CreateTimeSlotInput,
  TimeSlotRepository,
  UpdateTimeSlotInput,
  UpsertSlotRequirementInput,
} from '../../domain/contracts/infrastructure/time-slot.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { SlotRequirement } from '../../domain/entities/slot-requirement';
import type { TimeSlot } from '../../domain/entities/time-slot';
import { mapSlotRequirement, mapTimeSlot } from '../mappers/slot.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleTimeSlotRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleTimeSlotRepository implements TimeSlotRepository {
  constructor({ db }: DrizzleTimeSlotRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async fetchWithRequirements(
    db: AnyDrizzleDb,
    slotRow: typeof timeSlot.$inferSelect,
  ): Promise<TimeSlot> {
    const reqRows = await db
      .select({ requirement: slotRequirement })
      .from(slotRequirement)
      .innerJoin(shift, eq(shift.id, slotRequirement.shiftId))
      .where(eq(shift.timeSlotId, slotRow.id));
    return mapTimeSlot(
      slotRow,
      reqRows.map(({ requirement }) =>
        mapSlotRequirement(requirement, slotRow.id),
      ),
    );
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
    const [participation] = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation(ministryParticipation, churchId),
        ),
      )
      .limit(1);
    if (!participation) throw new NotFoundError('Participation not found');
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
      const [shiftRow] = await db
        .insert(shift)
        .values({
          churchId,
          participationId: participation.id,
          timeSlotId: slotRow.id,
          startTime: slotRow.startTime,
          endTime: slotRow.endTime,
          label: slotRow.label,
        })
        .returning();
      if (!shiftRow) throw new Error('Shift insert failed');

      const requirements = [];
      if (slotInput.requirements?.length) {
        const reqRows = await db
          .insert(slotRequirement)
          .values(
            slotInput.requirements.map((r) => ({
              churchId,
              participationId: participation.id,
              shiftId: shiftRow.id,
              roleId: r.roleId,
              teamId: r.teamId ?? null,
              requiredCount: r.requiredCount,
              notes: r.notes ?? null,
            })),
          )
          .returning();
        requirements.push(
          ...reqRows.map((row) => mapSlotRequirement(row, slotRow.id)),
        );
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
    const participations = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation(ministryParticipation, churchId),
        ),
      );
    if (participations.length) {
      await db.insert(shift).values(
        participations.map((participation) => ({
          churchId,
          participationId: participation.id,
          timeSlotId: row.id,
          startTime: row.startTime,
          endTime: row.endTime,
          label: row.label,
        })),
      );
    }
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
    const [targetShift] = await db
      .select()
      .from(shift)
      .where(
        and(eq(shift.timeSlotId, slotId), withChurchIsolation(shift, churchId)),
      )
      .limit(1);
    if (!targetShift) throw new NotFoundError('Shift not found for slot');
    const [existing] = await db
      .select()
      .from(slotRequirement)
      .where(
        and(
          eq(slotRequirement.shiftId, targetShift.id),
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
      return mapSlotRequirement(updated, slotId);
    }

    const [inserted] = await db
      .insert(slotRequirement)
      .values({
        churchId,
        participationId: targetShift.participationId,
        shiftId: targetShift.id,
        roleId: input.roleId,
        teamId: input.teamId ?? null,
        requiredCount: input.requiredCount,
        notes: input.notes ?? null,
      })
      .returning();
    if (!inserted) throw new Error('SlotRequirement insert failed');
    return mapSlotRequirement(inserted, slotId);
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
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(shift.timeSlotId, slotId),
          eq(assignment.roleId, roleId),
          inArray(assignment.status, ['pending', 'confirmed']),
        ),
      );
    return result?.cnt ?? 0;
  }
}
