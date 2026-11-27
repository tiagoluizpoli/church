import type { Instant } from '@church/time';
import type { EventTimeBlockId } from '../../branded-ids';
import type { Cycle } from '../../entities/cycle';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { EventGraph } from './event-graph.types';
import type {
  InstantBounds,
  MoveClashCandidate,
  MoveScopeAssignment,
} from './event-move.types';

/** What an edit does to one block: keeps (and retimes) it, adds it or drops it. */
export type EditBlockChange = 'kept' | 'added' | 'dropped';

export interface EditedBlockBounds {
  /** Absent for an added block. */
  eventTimeBlockId: EventTimeBlockId | undefined;
  label: string | undefined;
  change: EditBlockChange;
  /** Absent for an added block. */
  previous: InstantBounds | undefined;
  /** Absent for a dropped block. */
  proposed: InstantBounds | undefined;
}

export interface EditProposal {
  previousEvent: InstantBounds;
  proposedEvent: InstantBounds;
  /** Proposed blocks in request order, then the dropped ones. */
  eventTimeBlocks: EditedBlockBounds[];
}

export interface ProposeEditInput {
  event: Event;
  /** Every EventTimeBlock of the Event; only active ones can be kept. */
  eventTimeBlocks: EventTimeBlock[];
  /** The complete proposed Event: a block with `id` keeps that block. */
  proposed: EventGraph;
  /** Blocks holding an active Assignment: they cannot be dropped. */
  staffedBlockIds: EventTimeBlockId[];
  now: Instant;
  cycle: Cycle;
  /** The Church Timezone that reads the Event's start CalendarDay. */
  timeZone: string;
}

export interface ProposeShiftBoundsInput {
  previousBlock: InstantBounds;
  proposedBlock: InstantBounds;
  shift: InstantBounds;
  now: Instant;
}

export interface FollowInput {
  instant: Instant;
}

export interface FindEditClashesInput {
  proposal: EditProposal;
  /** The active Assignments of the edited Event. */
  scopeAssignments: MoveScopeAssignment[];
  /** Must exclude every Assignment of the edited Event. */
  candidates: MoveClashCandidate[];
  now: Instant;
}

export interface ProposedAssignment {
  assignment: MoveScopeAssignment;
  bounds: InstantBounds;
}
