import type { SoftConflictType } from '../conflict/types';
import type { AssignmentId } from '../entities/assignment';
import type {
  AssignmentAudit,
  AssignmentAuditAction,
} from '../entities/assignment-audit';
import type { ChurchId } from '../entities/church';
import type { UserId } from '../entities/volunteer';
import type { TransactionContext } from './transaction-context';

export interface CreateAssignmentAuditInput {
  assignmentId: AssignmentId;
  actorId: UserId;
  action: AssignmentAuditAction;
  reason?: string;
  overrideConflictTypes?: SoftConflictType[];
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
}
