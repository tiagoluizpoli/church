import type { AssignmentId, ChurchId, UserId } from '../domain/branded-ids';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';

export interface RemoveAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  actorId: UserId;
  tx: TransactionContext;
  assignmentRepository: AssignmentRepository;
  auditRepository: AssignmentAuditRepository;
  swapRequestRepository: SwapRequestRepository;
}

/**
 * The established Assignment removal, shared by a leader's removal and a
 * move's clash withdrawal: audit it, close an open SwapRequest as `covered`,
 * then hard-delete it. The caller holds the Assignment's Participation lock.
 */
export async function removeAssignment({
  churchId,
  assignmentId,
  actorId,
  tx,
  assignmentRepository,
  auditRepository,
  swapRequestRepository,
}: RemoveAssignmentInput): Promise<void> {
  await auditRepository.create({
    churchId,
    input: { assignmentId, actorId, action: 'deleted' },
    tx,
  });
  await swapRequestRepository.closeOpenByAssignment({
    churchId,
    assignmentId,
    status: 'covered',
    closedBy: actorId,
    tx,
  });
  await assignmentRepository.deleteById({ churchId, assignmentId, tx });
}
