import type { Instant } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  MinistryId,
  SwapRequestId,
  UserId,
} from '../../branded-ids';
import type { SwapRequestStatus } from '../../entities/swap-request';

export interface RaiseSwapRequestCommand {
  churchId: ChurchId;
  userId: UserId;
  assignmentId: AssignmentId;
  note?: string;
}

export type WithdrawSwapRequestCommand = Omit<RaiseSwapRequestCommand, 'note'>;

export interface KeepSwapRequestCommand {
  churchId: ChurchId;
  /** The answering leader or ChurchAdmin, already authorized for `ministryId`. */
  userId: UserId;
  ministryId: MinistryId;
  swapRequestId: SwapRequestId;
  reply?: string;
}

export interface RaisedSwapRequest {
  id: SwapRequestId;
  assignmentId: AssignmentId;
  status: SwapRequestStatus;
  note?: string;
  raisedAt: Instant;
}

export interface ISwapRequestManager {
  raise(input: RaiseSwapRequestCommand): Promise<RaisedSwapRequest>;
  /** Closes the caller's open request as `withdrawn`; never touches the Assignment or notifies. */
  withdraw(input: WithdrawSwapRequestCommand): Promise<void>;
  /** Closes the open request as `kept` and enqueues N8; never touches the Assignment. */
  keep(input: KeepSwapRequestCommand): Promise<void>;
}
