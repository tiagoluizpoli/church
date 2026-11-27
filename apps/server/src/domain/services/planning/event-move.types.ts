import type { Instant } from '@church/time';
import type {
  AssignmentId,
  EventTimeBlockId,
  MinistryId,
  ShiftId,
  VolunteerId,
} from '../../branded-ids';
import type { Cycle } from '../../entities/cycle';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';

/**
 * What a move shifts: the whole Event (every active EventTimeBlock) or one
 * EventTimeBlock. Move preview and confirm, for Event and EventTimeBlock,
 * share this one proposal and clash computation.
 */
export type MoveScope =
  | { kind: 'event' }
  | { kind: 'eventTimeBlock'; eventTimeBlockId: EventTimeBlockId };

export interface InstantBounds {
  start: Instant;
  end: Instant;
}

export interface ProposedBlockBounds {
  eventTimeBlockId: EventTimeBlockId;
  label: string | undefined;
  /** True when the block (and its Shifts) shift by `deltaMs`. */
  moved: boolean;
  previous: InstantBounds;
  proposed: InstantBounds;
}

export interface MoveProposal {
  scope: MoveScope;
  /** The one delta applied to the scope's blocks and their Shifts. */
  deltaMs: number;
  previousEvent: InstantBounds;
  proposedEvent: InstantBounds;
  eventTimeBlocks: ProposedBlockBounds[];
}

export interface ProposeMoveInput {
  scope: MoveScope;
  event: Event;
  /** Every EventTimeBlock of the Event. */
  eventTimeBlocks: EventTimeBlock[];
  /** The requested start of the scope. */
  start: Instant;
  now: Instant;
  cycle: Cycle;
  /** The Church Timezone that reads the Event's start CalendarDay. */
  timeZone: string;
}

export interface InstantPair {
  left: Instant;
  right: Instant;
}

export interface ShiftInput {
  instant: Instant;
}

export interface BoundsPair {
  left: InstantBounds;
  right: InstantBounds;
}

/** One active Assignment on the moved scope, with the identities a clash row shows. */
export interface MoveScopeAssignment {
  assignmentId: AssignmentId;
  eventTimeBlockId: EventTimeBlockId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  volunteerName: string;
  ministryId: MinistryId;
  ministryName: string;
  /** The Shift bounds before the move. */
  shiftStart: Instant;
  shiftEnd: Instant;
}

/** An active Assignment outside the moved scope that a moved one could overlap. */
export interface MoveClashCandidate {
  volunteerId: VolunteerId;
  shiftStart: Instant;
  shiftEnd: Instant;
}

/** A moved Assignment that would overlap another active Assignment of the same Volunteer. */
export interface MoveClash {
  assignmentId: AssignmentId;
  eventTimeBlockId: EventTimeBlockId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  volunteerName: string;
  ministryId: MinistryId;
  ministryName: string;
  /** The Shift bounds after the move. */
  proposedStart: Instant;
  proposedEnd: Instant;
}

export interface FindMoveClashesInput {
  deltaMs: number;
  scopeAssignments: MoveScopeAssignment[];
  /** Must already exclude every Assignment of the moved scope. */
  candidates: MoveClashCandidate[];
}
