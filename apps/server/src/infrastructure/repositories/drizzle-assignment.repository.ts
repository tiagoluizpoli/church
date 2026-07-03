import { NotFoundError } from '@church/core';
import { assignment, shift, timeSlot } from '@church/db';
import { and, between, count, eq, inArray, type SQL } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  TimeSlotId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  AssignmentRepository,
  CreateAssignmentInput,
  UpdateAssignmentStatusInput,
} from '../../domain/contracts/infrastructure/assignment.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  Assignment,
  AssignmentStatus,
} from '../../domain/entities/assignment';
import { mapAssignment } from '../mappers/assignment.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  private async rows(
    churchId: ChurchId,
    conditions: SQL[],
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select({ assignment, timeSlotId: shift.timeSlotId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(withChurchIsolation(assignment, churchId), ...conditions));
    return rows.map((row) => mapAssignment(row.assignment, row.timeSlotId));
  }

  async create(
    churchId: ChurchId,
    input: CreateAssignmentInput,
    tx?: TransactionContext,
  ): Promise<Assignment> {
    const db = getClient(this.db, tx);
    const [targetShift] = await db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.timeSlotId, input.slotId),
          withChurchIsolation(shift, churchId),
        ),
      )
      .limit(1);
    if (!targetShift) throw new NotFoundError('Shift not found for slot');

    const [row] = await db
      .insert(assignment)
      .values({
        churchId,
        participationId: targetShift.participationId,
        shiftId: targetShift.id,
        volunteerId: input.volunteerId,
        roleId: input.roleId,
        status: input.status ?? 'draft',
        reason: input.reason ?? null,
        assignedBy: input.assignedBy ?? null,
      })
      .returning();
    if (!row) throw new Error('Assignment insert failed');
    return mapAssignment(row, targetShift.timeSlotId);
  }

  async getById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<Assignment> {
    if (!isValidUuid(id))
      throw new NotFoundError(`Assignment not found: ${id}`);
    const [result] = await getClient(this.db, tx)
      .select({ assignment, timeSlotId: shift.timeSlotId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(
        and(eq(assignment.id, id), withChurchIsolation(assignment, churchId)),
      );
    if (!result) throw new NotFoundError(`Assignment not found: ${id}`);
    return mapAssignment(result.assignment, result.timeSlotId);
  }

  async findBySlotAndVolunteer(
    churchId: ChurchId,
    slotId: TimeSlotId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment | null> {
    const rows = await this.rows(
      churchId,
      [eq(shift.timeSlotId, slotId), eq(assignment.volunteerId, volunteerId)],
      tx,
    );
    return rows[0] ?? null;
  }

  listBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(churchId, [eq(shift.timeSlotId, slotId)], tx);
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select({ assignment, timeSlotId: shift.timeSlotId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(timeSlot.eventId, eventId),
        ),
      );
    return rows.map((row) => mapAssignment(row.assignment, row.timeSlotId));
  }

  listByVolunteer(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(churchId, [eq(assignment.volunteerId, volunteerId)], tx);
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    if (volunteerIds.length === 0) return [];
    return this.rows(
      churchId,
      [inArray(assignment.volunteerId, volunteerIds)],
      tx,
    );
  }

  listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.listRange(churchId, startTime, endTime, volunteerId, tx);
  }

  listByRange(
    churchId: ChurchId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.listRange(churchId, startTime, endTime, undefined, tx);
  }

  private async listRange(
    churchId: ChurchId,
    startTime: Date,
    endTime: Date,
    volunteerId?: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const conditions: SQL[] = [
      withChurchIsolation(assignment, churchId),
      between(shift.startTime, startTime, endTime),
    ];
    if (volunteerId) conditions.push(eq(assignment.volunteerId, volunteerId));
    const rows = await getClient(this.db, tx)
      .select({ assignment, timeSlotId: shift.timeSlotId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(...conditions));
    return rows.map((row) => mapAssignment(row.assignment, row.timeSlotId));
  }

  async updateStatus(
    churchId: ChurchId,
    id: AssignmentId,
    input: UpdateAssignmentStatusInput,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .update(assignment)
      .set({ status: input.status, reason: input.reason ?? null })
      .where(
        and(eq(assignment.id, id), withChurchIsolation(assignment, churchId)),
      );
  }

  async countByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    statusFilter?: AssignmentStatus[],
    tx?: TransactionContext,
  ): Promise<number> {
    const conditions: SQL[] = [
      withChurchIsolation(assignment, churchId),
      eq(assignment.volunteerId, volunteerId),
      between(shift.startTime, startTime, endTime),
    ];
    if (statusFilter?.length) {
      conditions.push(inArray(assignment.status, statusFilter));
    }
    const [result] = await getClient(this.db, tx)
      .select({ cnt: count() })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(...conditions));
    return result?.cnt ?? 0;
  }

  async deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void> {
    const rows = await getClient(this.db, tx)
      .select({ id: assignment.id })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(timeSlot, eq(timeSlot.id, shift.timeSlotId))
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(timeSlot.eventId, eventId),
        ),
      );
    if (rows.length === 0) return;
    await getClient(this.db, tx)
      .delete(assignment)
      .where(
        inArray(
          assignment.id,
          rows.map(({ id }) => id),
        ),
      );
  }

  async deleteById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(assignment)
      .where(
        and(eq(assignment.id, id), withChurchIsolation(assignment, churchId)),
      );
  }

  listDeclinedBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(
      churchId,
      [eq(shift.timeSlotId, slotId), eq(assignment.status, 'declined')],
      tx,
    );
  }
}
