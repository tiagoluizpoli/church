import type { SoftConflictType } from '../conflict/types';
import type { AssignmentId } from '../entities/assignment';
import type {
  AssignmentAudit,
  AssignmentAuditAction,
} from '../entities/assignment-audit';
import type { ChurchId } from '../entities/church';
import type { EventId } from '../entities/event';
import type { UserId } from '../entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface CreateAssignmentAuditInput {
  assignmentId: AssignmentId;
  actorId: UserId;
  action: AssignmentAuditAction;
  reason?: string;
  overrideConflictTypes?: SoftConflictType[];
}

/** Enriched audit entry returned by listByEvent (with joined display fields). */
export interface AssignmentAuditLogEntry {
  id: string;
  assignmentId: string;
  volunteerId: string;
  volunteerName: string;
  slotId: string;
  slotLabel: string;
  roleId: string;
  roleName: string;
  action: AssignmentAuditAction;
  reason: string | null;
  actorId: string;
  actorName: string;
  timestamp: Date;
}

export interface AssignmentAuditRepository {
  create(
    churchId: ChurchId,
    input: CreateAssignmentAuditInput,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit>;

  listByAssignment(
    churchId: ChurchId,
    assignmentId: AssignmentId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]>;

  listByChurch(
    churchId: ChurchId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]>;

  listByActor(
    churchId: ChurchId,
    actorId: UserId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]>;

  /**
   * List enriched audit entries for all assignments within an event,
   * joined with volunteer / slot / role / actor display fields.
   */
  listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<AssignmentAuditLogEntry[]>;
}
