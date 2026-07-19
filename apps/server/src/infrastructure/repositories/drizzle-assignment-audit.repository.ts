import {
  assignment,
  assignmentAudit,
  event,
  ministryParticipation,
  role,
  shift,
  timeSlot,
  user,
  volunteer,
} from '@church/db';
import { aliasedTable, and, desc, eq } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  UserId,
} from '../../domain/branded-ids';
import type {
  AssignmentAuditLogEntry,
  AssignmentAuditRepository,
  CreateAssignmentAuditInput,
  ListAuditByCycleInput,
} from '../../domain/contracts/infrastructure/assignment-audit.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { AssignmentAudit } from '../../domain/entities/assignment-audit';
import { mapAssignmentAudit } from '../mappers/assignment-audit.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAssignmentAuditRepository
  implements AssignmentAuditRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

  async create(
    churchId: ChurchId,
    input: CreateAssignmentAuditInput,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit> {
    const [row] = await getClient(this.db, tx)
      .insert(assignmentAudit)
      .values({
        churchId,
        assignmentId: input.assignmentId,
        actorId: input.actorId,
        action: (input.action === 'event_published' ||
        input.action === 'event_cancelled'
          ? 'status_change'
          : input.action) as
          | 'created'
          | 'updated'
          | 'deleted'
          | 'status_change',
        reason: input.reason ?? null,
        timestamp: new Date(),
      })
      .returning();
    if (!row) throw new Error('AssignmentAudit insert failed');
    return mapAssignmentAudit(row);
  }

  async listByAssignment(
    churchId: ChurchId,
    assignmentId: AssignmentId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignmentAudit)
      .where(
        and(
          withChurchIsolation(assignmentAudit, churchId),
          eq(assignmentAudit.assignmentId, assignmentId),
        ),
      )
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }

  async listByCycle(
    input: ListAuditByCycleInput,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select({
        id: assignmentAudit.id,
        churchId: assignmentAudit.churchId,
        assignmentId: assignmentAudit.assignmentId,
        actorId: assignmentAudit.actorId,
        action: assignmentAudit.action,
        reason: assignmentAudit.reason,
        timestamp: assignmentAudit.timestamp,
      })
      .from(assignmentAudit)
      .innerJoin(assignment, eq(assignmentAudit.assignmentId, assignment.id))
      .innerJoin(
        ministryParticipation,
        eq(assignment.participationId, ministryParticipation.id),
      )
      .innerJoin(event, eq(ministryParticipation.eventId, event.id))
      .where(
        and(
          withChurchIsolation(assignmentAudit, input.churchId),
          eq(event.planningCycleId, input.cycleId),
          eq(ministryParticipation.ministryId, input.ministryId),
        ),
      )
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }

  async listByChurch(
    churchId: ChurchId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignmentAudit)
      .where(withChurchIsolation(assignmentAudit, churchId))
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }

  async listByActor(
    churchId: ChurchId,
    actorId: UserId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignmentAudit)
      .where(
        and(
          withChurchIsolation(assignmentAudit, churchId),
          eq(assignmentAudit.actorId, actorId),
        ),
      )
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<AssignmentAuditLogEntry[]> {
    const db = getClient(this.db, tx);
    const volunteerUser = aliasedTable(user, 'volunteer_user');
    const actorUser = aliasedTable(user, 'actor_user');

    const rows = await db
      .select({
        id: assignmentAudit.id,
        assignmentId: assignmentAudit.assignmentId,
        volunteerId: assignment.volunteerId,
        volunteerName: volunteerUser.name,
        slotId: timeSlot.id,
        slotLabel: timeSlot.label,
        slotStart: timeSlot.startTime,
        roleId: role.id,
        roleName: role.name,
        action: assignmentAudit.action,
        reason: assignmentAudit.reason,
        actorId: assignmentAudit.actorId,
        actorName: actorUser.name,
        timestamp: assignmentAudit.timestamp,
      })
      .from(assignmentAudit)
      .innerJoin(assignment, eq(assignmentAudit.assignmentId, assignment.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(timeSlot, eq(shift.timeSlotId, timeSlot.id))
      .innerJoin(role, eq(assignment.roleId, role.id))
      .innerJoin(volunteer, eq(assignment.volunteerId, volunteer.id))
      .leftJoin(volunteerUser, eq(volunteer.userId, volunteerUser.id))
      .leftJoin(actorUser, eq(assignmentAudit.actorId, actorUser.id))
      .where(
        and(
          withChurchIsolation(assignmentAudit, churchId),
          eq(timeSlot.eventId, eventId),
        ),
      )
      .orderBy(desc(assignmentAudit.timestamp));

    return rows.map((r) => ({
      id: r.id,
      assignmentId: r.assignmentId,
      volunteerId: r.volunteerId,
      volunteerName: r.volunteerName ?? r.volunteerId,
      slotId: r.slotId,
      slotLabel: r.slotLabel ?? r.slotStart.toISOString(),
      roleId: r.roleId,
      roleName: r.roleName,
      action: r.action as AssignmentAuditLogEntry['action'],
      reason: r.reason ?? null,
      actorId: r.actorId,
      actorName: r.actorName ?? r.actorId,
      timestamp: r.timestamp,
    }));
  }
}
