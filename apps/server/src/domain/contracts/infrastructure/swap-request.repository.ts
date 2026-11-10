import type { AssignmentId, ChurchId, UserId } from '../../branded-ids';
import type {
  ClosedSwapRequestStatus,
  SwapRequest,
} from '../../entities/swap-request';
import type { TransactionContext } from './transaction-context';

export interface CreateSwapRequestInput {
  swapRequest: SwapRequest;
  tx?: TransactionContext;
}

export interface FindOpenSwapRequestInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  tx?: TransactionContext;
}

export interface ListOpenAssignmentIdsInput {
  churchId: ChurchId;
  assignmentIds: AssignmentId[];
}

export interface CloseOpenSwapRequestInput extends FindOpenSwapRequestInput {
  status: ClosedSwapRequestStatus;
  closedBy?: UserId;
}

export interface SwapRequestRepository {
  /** Throws `SwapRequestAlreadyOpenError` when the Assignment already has an open request. */
  create(input: CreateSwapRequestInput): Promise<void>;
  findOpenByAssignment(
    input: FindOpenSwapRequestInput,
  ): Promise<SwapRequest | null>;
  /** The Assignment's most recent request in any status, if any. */
  findLatestByAssignment(
    input: FindOpenSwapRequestInput,
  ): Promise<SwapRequest | null>;
  /** Which of these Assignments carry an open request. */
  listOpenAssignmentIds(
    input: ListOpenAssignmentIdsInput,
  ): Promise<AssignmentId[]>;
  /** Closes the Assignment's open request, if any; a no-op otherwise. Never deletes. */
  closeOpenByAssignment(input: CloseOpenSwapRequestInput): Promise<void>;
}
