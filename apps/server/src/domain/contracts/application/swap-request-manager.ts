import type { Instant } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  SwapRequestId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { SwapRequestStatus } from '../../entities/swap-request';

export interface RaiseSwapRequestCommand {
  churchId: ChurchId;
  userId: UserId;
  volunteerId: VolunteerId;
  assignmentId: AssignmentId;
  note?: string;
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
}
