import type { Instant } from '@church/time';
import type {
  AssignmentId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { MoveScope } from './event-move.types';

/**
 * What a cancellation ends: the whole Event or one EventTimeBlock. The same
 * two scopes move uses, so preview, confirm and both routes share one shape.
 */
export type CancellationScope = MoveScope;

/** The bounds and EventTimeBlocks a cancellation covers. */
export interface ResolvedCancellationScope {
  start: Instant;
  end: Instant;
  /** The active blocks in scope: every one for an Event, the one block otherwise. */
  eventTimeBlockIds: EventTimeBlockId[];
}

export interface ResolveCancellationScopeInput {
  scope: CancellationScope;
  /** A scheduled Event of a Sent Cycle; the caller checks those states. */
  event: Event;
  /** Every EventTimeBlock of the Event. */
  eventTimeBlocks: EventTimeBlock[];
  now: Instant;
}

/** One active Assignment on the cancelled scope, with the facts N9 freezes. */
export interface CancellationScopeAssignment {
  assignmentId: AssignmentId;
  eventTimeBlockId: EventTimeBlockId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  /** The Volunteer's User: the N9 recipient. */
  userId: UserId;
  ministryId: MinistryId;
  ministryName: string;
  roleName: string;
  sectorName: string;
  shiftStart: Instant;
  shiftEnd: Instant;
  /**
   * Already visible to the Volunteer: pending in a published
   * Schedule. Only these are told (N9) and counted.
   */
  published: boolean;
  /** Carries an open SwapRequest that cancellation closes as covered. */
  openSwapRequest: boolean;
}

/** A Ministry participating in the cancelled scope (opted into or staffing it). */
export interface CancellationMinistry {
  id: MinistryId;
  name: string;
}

export interface CancellationMinistryImpact {
  ministryId: MinistryId;
  ministryName: string;
  /** Distinct published Volunteers of this Ministry told now; may be 0. */
  volunteerCount: number;
}

/** What a cancellation affects; preview and confirm both return it. */
export interface CancellationImpact {
  scope: CancellationScope;
  eventId: EventId;
  eventTitle: string;
  /** The selected scope's own bounds. */
  start: Instant;
  end: Instant;
  /** Distinct published Volunteers told now (the N9 recipients). */
  volunteerCount: number;
  /** Ministries those Volunteers span (rows with a non-zero count). */
  ministryCount: number;
  /** One row per participating Ministry, the N10 lines. */
  ministries: CancellationMinistryImpact[];
  openSwapRequestCount: number;
}

export interface SummarizeCancellationImpactInput {
  scope: CancellationScope;
  event: Event;
  resolved: ResolvedCancellationScope;
  assignments: CancellationScopeAssignment[];
  ministries: CancellationMinistry[];
}
