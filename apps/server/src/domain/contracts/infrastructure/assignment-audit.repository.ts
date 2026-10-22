import type {
  AssignmentId,
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  UserId,
} from '../../branded-ids';
import type { SoftConflictType } from '../../conflict/types';
import type {
  AssignmentAudit,
  AssignmentAuditAction,
} from '../../entities/assignment-audit';
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
  eventTimeBlockId: string;
  eventTimeBlockLabel: string;
  roleId: string;
  roleName: string;
  action: AssignmentAuditAction;
  reason: string | null;
  actorId: string;
  actorName: string;
  timestamp: Date;
}

export interface ListAuditByCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface CreateAssignmentAuditRepositoryInput {
  churchId: ChurchId;
  input: CreateAssignmentAuditInput;
  tx?: TransactionContext;
}

export interface ListAuditByChurchInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface ListAuditByActorInput {
  churchId: ChurchId;
  actorId: UserId;
  tx?: TransactionContext;
}

export interface ListAuditByEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface AssignmentAuditRepository {
  create(input: CreateAssignmentAuditRepositoryInput): Promise<AssignmentAudit>;

  /** Cycle-wide audit entries for one ministry's participations, church-isolated. */
  listByCycle(input: ListAuditByCycleInput): Promise<AssignmentAudit[]>;

  listByChurch(input: ListAuditByChurchInput): Promise<AssignmentAudit[]>;

  listByActor(input: ListAuditByActorInput): Promise<AssignmentAudit[]>;

  /**
   * List enriched audit entries for all assignments within an event,
   * joined with volunteer / event time block / role / actor display fields.
   */
  listByEvent(input: ListAuditByEventInput): Promise<AssignmentAuditLogEntry[]>;
}
