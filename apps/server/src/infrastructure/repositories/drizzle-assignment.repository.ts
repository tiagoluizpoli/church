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
import type { ChurchId, VolunteerId } from '../../domain/branded-ids';
import type {
  AssignmentRepository,
  AssignmentsByEventInput,
  AssignmentsByEventTimeBlockInput,
  CountAssignmentsByVolunteerInRangeInput,
  CreateAssignmentRepositoryInput,
  FindAssignmentByEventTimeBlockAndVolunteerInput,
  GetAssignmentInput,
  ListAssignmentsByParticipationInput,
  ListAssignmentsByRangeInput,
  ListAssignmentsByShiftInput,
  ListAssignmentsByVolunteerInput,
  ListAssignmentsByVolunteerInRangeInput,
  ListAssignmentsByVolunteersInput,
  UpdateAssignmentStatusRepositoryInput,
} from '../../domain/contracts/infrastructure/assignment.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { Assignment } from '../../domain/entities/assignment';
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

interface RowsInput {
  churchId: ChurchId;
  conditions: SQL[];
  tx?: TransactionContext;
}

export class DrizzleAssignmentRepository implements AssignmentRepository {
  constructor({ db }: DrizzleAssignmentRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async rows({
    churchId,
    conditions,
    tx,
  }: RowsInput): Promise<Assignment[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(
        and(
          withChurchIsolation({ table: assignment, churchId }),
          ...conditions,
        ),
      );
    return rows.map((row) =>
      mapAssignment({
        row: row.assignment,
        eventTimeBlockId: row.eventTimeBlockId,
      }),
    );
  }

  async create({
    churchId,
    input,
    tx,
  }: CreateAssignmentRepositoryInput): Promise<Assignment> {
    const db = getClient({ db: this.db, tx });
    if (!input.shiftId && !input.eventTimeBlockId) {
      throw new Error(
        'Assignment creation requires either shiftId or eventTimeBlockId',
      );
    }
    const requirementJoin = eq(shift.id, shiftRequirement.shiftId);
    const conditions = [
      eq(shiftRequirement.id, input.shiftRequirementId),
      eq(shiftRequirement.participationId, shift.participationId),
      withChurchIsolation({ table: shiftRequirement, churchId }),
      withChurchIsolation({ table: shift, churchId }),
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
    return mapAssignment({
      row,
      eventTimeBlockId: targetShift.eventTimeBlockId,
    });
  }

  async getById({
    churchId,
    assignmentId,
    tx,
  }: GetAssignmentInput): Promise<Assignment> {
    if (!isValidUuid(assignmentId))
      throw new NotFoundError(`Assignment not found: ${assignmentId}`);
    const [result] = await getClient({ db: this.db, tx })
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(
        and(
          eq(assignment.id, assignmentId),
          withChurchIsolation({ table: assignment, churchId }),
        ),
      );
    if (!result)
      throw new NotFoundError(`Assignment not found: ${assignmentId}`);
    return mapAssignment({
      row: result.assignment,
      eventTimeBlockId: result.eventTimeBlockId,
    });
  }

  async findByEventTimeBlockAndVolunteer({
    churchId,
    eventTimeBlockId,
    volunteerId,
    tx,
  }: FindAssignmentByEventTimeBlockAndVolunteerInput): Promise<Assignment | null> {
    const rows = await this.rows({
      churchId,
      conditions: [
        eq(shift.eventTimeBlockId, eventTimeBlockId),
        eq(assignment.volunteerId, volunteerId),
      ],
      tx,
    });
    return rows[0] ?? null;
  }

  listByEventTimeBlock({
    churchId,
    eventTimeBlockId,
    tx,
  }: AssignmentsByEventTimeBlockInput): Promise<Assignment[]> {
    return this.rows({
      churchId,
      conditions: [eq(shift.eventTimeBlockId, eventTimeBlockId)],
      tx,
    });
  }

  async listByEvent({
    churchId,
    eventId,
    tx,
  }: AssignmentsByEventInput): Promise<Assignment[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .where(
        and(
          withChurchIsolation({ table: assignment, churchId }),
          eq(eventTimeBlock.eventId, eventId),
        ),
      );
    return rows.map((row) =>
      mapAssignment({
        row: row.assignment,
        eventTimeBlockId: row.eventTimeBlockId,
      }),
    );
  }

  listByParticipation({
    churchId,
    participationId,
    tx,
  }: ListAssignmentsByParticipationInput): Promise<Assignment[]> {
    return this.rows({
      churchId,
      conditions: [eq(assignment.participationId, participationId)],
      tx,
    });
  }

  listByShift({
    churchId,
    shiftId,
    tx,
  }: ListAssignmentsByShiftInput): Promise<Assignment[]> {
    return this.rows({
      churchId,
      conditions: [eq(assignment.shiftId, shiftId)],
      tx,
    });
  }

  listByVolunteer({
    churchId,
    volunteerId,
    tx,
  }: ListAssignmentsByVolunteerInput): Promise<Assignment[]> {
    return this.rows({
      churchId,
      conditions: [eq(assignment.volunteerId, volunteerId)],
      tx,
    });
  }

  async listByVolunteers({
    churchId,
    volunteerIds,
    tx,
  }: ListAssignmentsByVolunteersInput): Promise<Assignment[]> {
    if (volunteerIds.length === 0) return [];
    return this.rows({
      churchId,
      conditions: [inArray(assignment.volunteerId, volunteerIds)],
      tx,
    });
  }

  listByVolunteerInRange({
    churchId,
    volunteerId,
    startTime,
    endTime,
    tx,
  }: ListAssignmentsByVolunteerInRangeInput): Promise<Assignment[]> {
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

  listByRange({
    churchId,
    startTime,
    endTime,
    tx,
  }: ListAssignmentsByRangeInput): Promise<Assignment[]> {
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
      withChurchIsolation({ table: assignment, churchId }),
      timeCondition,
    ];
    if (volunteerId) conditions.push(eq(assignment.volunteerId, volunteerId));
    const rows = await getClient({ db: this.db, tx })
      .select({ assignment, eventTimeBlockId: shift.eventTimeBlockId })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(...conditions));
    return rows.map((row) =>
      mapAssignment({
        row: row.assignment,
        eventTimeBlockId: row.eventTimeBlockId,
      }),
    );
  }

  async updateStatus({
    churchId,
    assignmentId,
    input,
    tx,
  }: UpdateAssignmentStatusRepositoryInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(assignment)
      .set({ status: input.status, reason: input.reason ?? null })
      .where(
        and(
          eq(assignment.id, assignmentId),
          withChurchIsolation({ table: assignment, churchId }),
        ),
      );
  }

  async countByVolunteerInRange({
    churchId,
    volunteerId,
    startTime,
    endTime,
    statusFilter,
    tx,
  }: CountAssignmentsByVolunteerInRangeInput): Promise<number> {
    const conditions: SQL[] = [
      withChurchIsolation({ table: assignment, churchId }),
      eq(assignment.volunteerId, volunteerId),
      between(shift.startTime, startTime, endTime),
    ];
    if (statusFilter?.length) {
      conditions.push(inArray(assignment.status, statusFilter));
    }
    const [result] = await getClient({ db: this.db, tx })
      .select({ cnt: count() })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(...conditions));
    return result?.cnt ?? 0;
  }

  async deleteByEvent({
    churchId,
    eventId,
    tx,
  }: AssignmentsByEventInput): Promise<void> {
    const rows = await getClient({ db: this.db, tx })
      .select({ id: assignment.id })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .where(
        and(
          withChurchIsolation({ table: assignment, churchId }),
          eq(eventTimeBlock.eventId, eventId),
        ),
      );
    if (rows.length === 0) return;
    await getClient({ db: this.db, tx })
      .delete(assignment)
      .where(
        inArray(
          assignment.id,
          rows.map(({ id }) => id),
        ),
      );
  }

  async deleteById({
    churchId,
    assignmentId,
    tx,
  }: GetAssignmentInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .delete(assignment)
      .where(
        and(
          eq(assignment.id, assignmentId),
          withChurchIsolation({ table: assignment, churchId }),
        ),
      );
  }

  listDeclinedByEventTimeBlock({
    churchId,
    eventTimeBlockId,
    tx,
  }: AssignmentsByEventTimeBlockInput): Promise<Assignment[]> {
    return this.rows({
      churchId,
      conditions: [
        eq(shift.eventTimeBlockId, eventTimeBlockId),
        eq(assignment.status, 'declined'),
      ],
      tx,
    });
  }
}
