import type { AssignmentId, ChurchId, UserId } from '../domain/branded-ids';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';

export interface CancelAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  actorId: UserId;
  tx: TransactionContext;
  assignmentRepository: AssignmentRepository;
  auditRepository: AssignmentAuditRepository;
  swapRequestRepository: SwapRequestRepository;
}

/**
 * An Event or EventTimeBlock cancellation's Assignment write: keep the row as
 * `cancelled` for history (never Remove Assignment's hard delete), audit it as
 * `event_cancelled` by the acting User and close an open SwapRequest through
 * Spec 28's `covered` close, which sends no N8 (only a `kept` answer does).
 * The caller holds the Church and Participation locks. True when it closed a
 * request.
 */
export async function cancelAssignment({
  churchId,
  assignmentId,
  actorId,
  tx,
  assignmentRepository,
  auditRepository,
  swapRequestRepository,
}: CancelAssignmentInput): Promise<boolean> {
  await assignmentRepository.updateStatus({
    churchId,
    assignmentId,
    input: { status: 'cancelled' },
    tx,
  });
  await auditRepository.create({
    churchId,
    input: { assignmentId, actorId, action: 'event_cancelled' },
    tx,
  });
  return swapRequestRepository.closeOpenByAssignment({
    churchId,
    assignmentId,
    status: 'covered',
    closedBy: actorId,
    tx,
  });
}
