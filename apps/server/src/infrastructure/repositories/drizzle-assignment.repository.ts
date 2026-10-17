import { NotFoundError } from '@church/core';
import {
  assignment,
  eventTimeBlock,
  shift,
  shiftRequirement,
} from '@church/db';
import {
  and,
  between,
  count,
  eq,
  gt,
  inArray,
  lt,
  type SQL,
} from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryParticipationId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  AssignmentRepository,
  CreateAssignmentRepositoryInput,
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

interface DrizzleAssignmentRepositoryInput {
  db: AnyDrizzleDb;
}

interface ListRangeInput {
  churchId: ChurchId;
  timeCondition: SQL;
  volunteerId?: VolunteerId;
  tx?: TransactionContext;
}

export class DrizzleAssignmentRepository implements AssignmentRepository {
  constructor({ db }: DrizzleAssignmentRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async rows(
    churchId: ChurchId,
    conditions: SQL[],
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(withChurchIsolation(assignment, churchId), ...conditions));
    return rows.map((row) =>
      mapAssignment(row.assignment, row.eventTimeBlockId),
    );
  }

  async create({
    churchId,
    input,
    tx,
  }: CreateAssignmentRepositoryInput): Promise<Assignment> {
    const db = getClient(this.db, tx);
    if (!input.shiftId && !input.eventTimeBlockId) {
      throw new Error(
        'Assignment creation requires either shiftId or eventTimeBlockId',
      );
    }
    const requirementJoin = eq(shift.id, shiftRequirement.shiftId);
    const conditions = [
      eq(shiftRequirement.id, input.shiftRequirementId),
      eq(shiftRequirement.participationId, shift.participationId),
      withChurchIsolation(shiftRequirement, churchId),
      withChurchIsolation(shift, churchId),
    ];
    if (input.shiftId) {
      const requestedShift = eq(shift.id, input.shiftId);
      conditions.push(requestedShift);
    }
    if (input.eventTimeBlockId) {
      const requestedBlock = eq(shift.eventTimeBlockId, input.eventTimeBlockId);
      conditions.push(requestedBlock);
    }
    if (input.participationId) {
      const requestedParticipation = eq(
        shiftRequirement.participationId,
        input.participationId,
      );
      conditions.push(requestedParticipation);
    }
    const requirementPredicate = and(...conditions);
    const [selected] = await db
      .select({ requirement: shiftRequirement, targetShift: shift })
      .from(shiftRequirement)
      .innerJoin(shift, requirementJoin)
      .where(requirementPredicate);
    if (!selected) throw new NotFoundError('Shift requirement not found');
    const { requirement, targetShift } = selected;

    const [row] = await db
      .insert(assignment)
      .values({
        churchId,
        participationId: requirement.participationId,
        shiftId: targetShift.id,
        volunteerId: input.volunteerId,
        roleId: requirement.roleId,
        shiftRequirementId: requirement.id,
        status: input.status ?? 'draft',
        reason: input.reason ?? null,
        assignedBy: input.assignedBy ?? null,
      })
      .returning();
    if (!row) throw new Error('Assignment insert failed');
    return mapAssignment(row, targetShift.eventTimeBlockId);
  }

  async getById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<Assignment> {
    if (!isValidUuid(id))
      throw new NotFoundError(`Assignment not found: ${id}`);
    const [result] = await getClient(this.db, tx)
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(
        and(eq(assignment.id, id), withChurchIsolation(assignment, churchId)),
      );
    if (!result) throw new NotFoundError(`Assignment not found: ${id}`);
    return mapAssignment(result.assignment, result.eventTimeBlockId);
  }

  async findByEventTimeBlockAndVolunteer(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment | null> {
    const rows = await this.rows(
      churchId,
      [
        eq(shift.eventTimeBlockId, eventTimeBlockId),
        eq(assignment.volunteerId, volunteerId),
      ],
      tx,
    );
    return rows[0] ?? null;
  }

  listByEventTimeBlock(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(
      churchId,
      [eq(shift.eventTimeBlockId, eventTimeBlockId)],
      tx,
    );
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    const rows = await getClient(this.db, tx)
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(eventTimeBlock.eventId, eventId),
        ),
      );
    return rows.map((row) =>
      mapAssignment(row.assignment, row.eventTimeBlockId),
    );
  }

  listByParticipation(
    churchId: ChurchId,
    participationId: MinistryParticipationId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(
      churchId,
      [eq(assignment.participationId, participationId)],
      tx,
    );
  }

  listByShift(
    churchId: ChurchId,
    shiftId: ShiftId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(churchId, [eq(assignment.shiftId, shiftId)], tx);
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
    // Overlap, not "starts inside": catches earlier-starting Shifts and lets back-to-back ones through.
    return this.listRange({
      churchId,
      timeCondition: and(
        lt(shift.startTime, endTime),
        gt(shift.endTime, startTime),
      ) as SQL,
      volunteerId,
      tx,
    });
  }

  listByRange(
    churchId: ChurchId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.listRange({
      churchId,
      timeCondition: between(shift.startTime, startTime, endTime),
      tx,
    });
  }

  private async listRange({
    churchId,
    timeCondition,
    volunteerId,
    tx,
  }: ListRangeInput): Promise<Assignment[]> {
    const conditions: SQL[] = [
      withChurchIsolation(assignment, churchId),
      timeCondition,
    ];
    if (volunteerId) conditions.push(eq(assignment.volunteerId, volunteerId));
    const rows = await getClient(this.db, tx)
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(...conditions));
    return rows.map((row) =>
      mapAssignment(row.assignment, row.eventTimeBlockId),
    );
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
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(eventTimeBlock.eventId, eventId),
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

  listDeclinedByEventTimeBlock(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<Assignment[]> {
    return this.rows(
      churchId,
      [
        eq(shift.eventTimeBlockId, eventTimeBlockId),
        eq(assignment.status, 'declined'),
      ],
      tx,
    );
  }
}
