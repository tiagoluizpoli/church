import { NotFoundError } from '@church/core';
import { shift, slotRequirement } from '@church/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type {
  CreateShiftsInput,
  DeleteShiftInput,
  DeleteShiftsBySlotInput,
  GetShiftInput,
  ListRequirementsByParticipationInput,
  ListShiftsByParticipationInput,
  ListShiftsBySlotInput,
  ShiftRepository,
  UpdateShiftInput,
  UpsertShiftRequirementInput,
} from '../../domain/contracts/infrastructure/shift.repository';
import type { Shift } from '../../domain/entities/shift';
import type { SlotRequirement } from '../../domain/entities/slot-requirement';
import { mapShift } from '../mappers/shift.mapper';
import { mapSlotRequirement } from '../mappers/slot.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleShiftRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleShiftRepository implements ShiftRepository {
  constructor({ db }: DrizzleShiftRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async createMany(input: CreateShiftsInput): Promise<Shift[]> {
    if (input.shifts.length === 0) {
      return [];
    }

    const db = getClient(this.db, input.tx);
    const rows = await db
      .insert(shift)
      .values(
        input.shifts.map((entity) => ({
          id: entity.id,
          churchId: input.churchId,
          participationId: entity.participationId,
          timeSlotId: entity.timeSlotId,
          startTime: entity.startTime,
          endTime: entity.endTime,
          label: entity.label ?? null,
        })),
      )
      .returning();

    return rows.map(mapShift);
  }

  async getById(input: GetShiftInput): Promise<Shift> {
    if (!isValidUuid(input.shiftId)) {
      throw new NotFoundError(`Shift not found: ${input.shiftId}`);
    }

    const db = getClient(this.db, input.tx);
    const [row] = await db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.id, input.shiftId),
          withChurchIsolation(shift, input.churchId),
        ),
      );

    if (!row) {
      throw new NotFoundError(`Shift not found: ${input.shiftId}`);
    }

    return mapShift(row);
  }

  async listByParticipation(
    input: ListShiftsByParticipationInput,
  ): Promise<Shift[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.participationId, input.participationId),
          withChurchIsolation(shift, input.churchId),
        ),
      )
      .orderBy(asc(shift.startTime));

    return rows.map(mapShift);
  }

  async listBySlot(input: ListShiftsBySlotInput): Promise<Shift[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.participationId, input.participationId),
          eq(shift.timeSlotId, input.timeSlotId),
          withChurchIsolation(shift, input.churchId),
        ),
      )
      .orderBy(asc(shift.startTime));

    return rows.map(mapShift);
  }

  async update(input: UpdateShiftInput): Promise<Shift> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .update(shift)
      .set({
        ...(input.startTime !== undefined
          ? { startTime: input.startTime }
          : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
      })
      .where(
        and(
          eq(shift.id, input.shiftId),
          withChurchIsolation(shift, input.churchId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Shift not found: ${input.shiftId}`);
    }

    return mapShift(row);
  }

  async deleteById(input: DeleteShiftInput): Promise<void> {
    const db = getClient(this.db, input.tx);
    await db
      .delete(shift)
      .where(
        and(
          eq(shift.id, input.shiftId),
          withChurchIsolation(shift, input.churchId),
        ),
      );
  }

  async deleteBySlot(input: DeleteShiftsBySlotInput): Promise<void> {
    const db = getClient(this.db, input.tx);
    await db
      .delete(shift)
      .where(
        and(
          eq(shift.participationId, input.participationId),
          eq(shift.timeSlotId, input.timeSlotId),
          withChurchIsolation(shift, input.churchId),
        ),
      );
  }

  async upsertRequirement(
    input: UpsertShiftRequirementInput,
  ): Promise<SlotRequirement> {
    const db = getClient(this.db, input.tx);
    const teamCondition = input.teamId
      ? eq(slotRequirement.teamId, input.teamId)
      : isNull(slotRequirement.teamId);
    const [existing] = await db
      .select()
      .from(slotRequirement)
      .where(
        and(
          eq(slotRequirement.shiftId, input.shiftId),
          eq(slotRequirement.roleId, input.roleId),
          teamCondition,
          withChurchIsolation(slotRequirement, input.churchId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(slotRequirement)
        .set({
          requiredCount: input.requiredCount,
          notes: input.notes ?? null,
        })
        .where(eq(slotRequirement.id, existing.id))
        .returning();

      if (!updated) {
        throw new Error('Slot requirement update failed');
      }

      return mapSlotRequirement(updated);
    }

    const [inserted] = await db
      .insert(slotRequirement)
      .values({
        churchId: input.churchId,
        participationId: input.participationId,
        shiftId: input.shiftId,
        roleId: input.roleId,
        teamId: input.teamId ?? null,
        requiredCount: input.requiredCount,
        notes: input.notes ?? null,
      })
      .returning();

    if (!inserted) {
      throw new Error('Slot requirement insert failed');
    }

    return mapSlotRequirement(inserted);
  }

  async listRequirementsByParticipation(
    input: ListRequirementsByParticipationInput,
  ): Promise<SlotRequirement[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(slotRequirement)
      .where(
        and(
          eq(slotRequirement.participationId, input.participationId),
          withChurchIsolation(slotRequirement, input.churchId),
        ),
      );

    return rows.map((row) => mapSlotRequirement(row));
  }
}
