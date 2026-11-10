import type { Instant } from '@church/time';
import type { ChurchId, CycleId, MinistryId } from '../../branded-ids';

export interface ListLeaderSwapRequestsCommand {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId?: CycleId;
}

/** The leader/admin view of one request; the only read that carries the note. */
export interface LeaderSwapRequest {
  id: string;
  assignmentId: string;
  volunteerName: string;
  eventTitle: string;
  roleName: string;
  sectorName: string;
  startsAt: Instant;
  endsAt: Instant;
  note?: string;
  raisedAt: Instant;
  status: 'open' | 'expired';
}

export interface ScheduleSwapRequests {
  cycleId: string;
  /** Open requests only; expired ones are listed but never counted. */
  openCount: number;
  requests: LeaderSwapRequest[];
}

export interface ISwapRequestListManager {
  listForLeader(input: ListLeaderSwapRequestsCommand): Promise<{
    schedules: ScheduleSwapRequests[];
  }>;
}
