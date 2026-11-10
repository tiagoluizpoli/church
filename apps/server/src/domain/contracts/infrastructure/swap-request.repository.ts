import type { Instant } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  CycleId,
  MinistryId,
  SwapRequestId,
  UserId,
} from '../../branded-ids';
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

export interface ListLeaderSwapRequestsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId?: CycleId;
}

/** One request with the Shift line facts the leader read shows. */
export interface LeaderSwapRequestRow {
  id: SwapRequestId;
  assignmentId: AssignmentId;
  /** As stored; the reader derives `expired` once the Shift has started. */
  status: 'open' | 'expired';
  note?: string;
  raisedAt: Instant;
  cycleId: CycleId;
  volunteerName: string;
  eventTitle: string;
  roleName: string;
  sectorName: string;
  startsAt: Instant;
  endsAt: Instant;
}

export interface SwapRequestRepository {
  /** The Ministry's open requests, plus expired ones until their Shift ends. */
  listForLeader(
    input: ListLeaderSwapRequestsInput,
  ): Promise<LeaderSwapRequestRow[]>;
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
  /** Closes the Assignment's open request only while it is still open; false when none was (already closed or none raised). Never deletes. */
  closeOpenByAssignment(input: CloseOpenSwapRequestInput): Promise<boolean>;
}
