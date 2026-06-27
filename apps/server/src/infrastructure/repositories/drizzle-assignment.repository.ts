import { NotFoundError } from '@church/core';
import { assignment, timeSlot } from '@church/db';
import { and, between, count, eq, inArray } from 'drizzle-orm';
import type {
  Assignment,
  AssignmentId,
  AssignmentStatus,
} from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { VolunteerId } from '../../domain/entities/volunteer';
import type {
  AssignmentRepository,
  CreateAssignmentInput,
  UpdateAssignmentStatusInput,
} from '../../domain/repositories/assignment.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { mapAssignment } from './assignment.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async create(
    churchId: ChurchId,
    input: CreateAssignmentInput,
    tx?: TransactionContext,
  ): Promise<Assignment> {
    const [row] = await getClient(this.db, tx)
      .insert(assignment)
      .values({
        churchId,
        slotId: input.slotId,
        volunteerId: input.volunteerId,
        roleId: input.roleId,
        status: (input.status ?? 'draft') as
          | 'pending'
          | 'confirmed'
          | 'declined',
        reason: input.reason ?? null,
        assignedBy: input.assignedBy ?? null,
      })
      .returning();
    if (!row) throw new Error('Assignment insert failed');
    return mapAssignment(row);
  }

  async getById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<Assignment> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Assignment not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(assignment)
      .where(
        and(eq(assignment.id, id), withChurchIsolation(assignment, churchId)),
      );
    if (!row) throw new NotFoundError(`Assignment not found: ${id}`);
    return mapAssignment(row);
  }

  async findBySlotAndVolunteer(
    churchId: ChurchId,
    slotId: TimeSlotId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment | null> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(assignment.slotId, slotId),
          eq(assignment.volunteerId, volunteerId),
        ),
      );
    return row ? mapAssignment(row) : null;
  }

  async listBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(assignment.slotId, slotId),
        ),
      );
    return rows.map(mapAssignment);
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const db = getClient(this.db, tx);
    const slotRows = await db
      .select({ id: timeSlot.id })
      .from(timeSlot)
      .where(eq(timeSlot.eventId, eventId));
    if (!slotRows.length) return [];
    const slotIds = slotRows.map((r) => r.id);
    const rows = await db
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          inArray(assignment.slotId, slotIds),
        ),
      );
    return rows.map(mapAssignment);
  }

  async listByVolunteer(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(assignment.volunteerId, volunteerId),
        ),
      );
    return rows.map(mapAssignment);
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    if (volunteerIds.length === 0) return [];

    const rows = await getClient(this.db, tx)
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          inArray(assignment.volunteerId, volunteerIds),
        ),
      );
    return rows.map(mapAssignment);
  }

  async listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const db = getClient(this.db, tx);
    const slotRows = await db
      .select({ id: timeSlot.id })
      .from(timeSlot)
      .where(between(timeSlot.startTime, startTime, endTime));
    if (!slotRows.length) return [];
    const slotIds = slotRows.map((r) => r.id);
    const rows = await db
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(assignment.volunteerId, volunteerId),
          inArray(assignment.slotId, slotIds),
        ),
      );
    return rows.map(mapAssignment);
  }

  async listByRange(
    churchId: ChurchId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const db = getClient(this.db, tx);
    const slotRows = await db
      .select({ id: timeSlot.id })
      .from(timeSlot)
      .where(between(timeSlot.startTime, startTime, endTime));
    if (!slotRows.length) return [];
    const slotIds = slotRows.map((r) => r.id);
    const rows = await db
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          inArray(assignment.slotId, slotIds),
        ),
      );
    return rows.map(mapAssignment);
  }

  async updateStatus(
    churchId: ChurchId,
    id: AssignmentId,
    input: UpdateAssignmentStatusInput,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .update(assignment)
      .set({
        status: input.status as 'pending' | 'confirmed' | 'declined',
        reason: input.reason ?? null,
      })
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
    const db = getClient(this.db, tx);
    const slotRows = await db
      .select({ id: timeSlot.id })
      .from(timeSlot)
      .where(between(timeSlot.startTime, startTime, endTime));
    if (!slotRows.length) return 0;
    const slotIds = slotRows.map((r) => r.id);
    const conditions = [
      withChurchIsolation(assignment, churchId),
      eq(assignment.volunteerId, volunteerId),
      inArray(assignment.slotId, slotIds),
    ];
    if (statusFilter?.length) {
      conditions.push(
        inArray(
          assignment.status,
          statusFilter as ('pending' | 'confirmed' | 'declined')[],
        ),
      );
    }
    const [result] = await db
      .select({ cnt: count() })
      .from(assignment)
      .where(and(...conditions));
    return result?.cnt ?? 0;
  }

  async deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void> {
    const db = getClient(this.db, tx);
    const slotRows = await db
      .select({ id: timeSlot.id })
      .from(timeSlot)
      .where(eq(timeSlot.eventId, eventId));
    if (!slotRows.length) return;
    const slotIds = slotRows.map((r) => r.id);
    await db
      .delete(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          inArray(assignment.slotId, slotIds),
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

  async listDeclinedBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignment)
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(assignment.slotId, slotId),
          eq(assignment.status, 'declined'),
        ),
      );
    return rows.map(mapAssignment);
  }
}
