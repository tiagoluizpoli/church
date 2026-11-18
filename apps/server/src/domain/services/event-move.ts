import {
  addMilliseconds,
  compareInstants,
  type Instant,
  millisecondsBetween,
} from '@church/time';
import type {
  AssignmentId,
  EventTimeBlockId,
  MinistryId,
  ShiftId,
  VolunteerId,
} from '../branded-ids';
import type { Cycle } from '../entities/cycle';
import type { Event } from '../entities/event';
import type { EventTimeBlock } from '../entities/event-time-block';
import { EventOutsideCycleError } from '../errors/event-outside-cycle';
import { MoveWindowClosedError } from '../errors/move-window-closed';

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

interface InstantPair {
  left: Instant;
  right: Instant;
}

interface ShiftInput {
  instant: Instant;
}

interface BoundsPair {
  left: InstantBounds;
  right: InstantBounds;
}

function isEarlier({ left, right }: InstantPair) {
  return compareInstants({ left, right }) < 0;
}

/**
 * Computes the proposed bounds of a move, preserving the scope's duration and
 * applying one delta to the scope. A block move stretches the Event bounds
 * and never shrinks them. Refuses a scope that already started, a target
 * start that is not in the future, and a final Event start day outside the
 * inclusive Cycle (the end may spill). Pure: reads nothing persisted.
 */
export function proposeMove({
  scope,
  event,
  eventTimeBlocks,
  start,
  now,
  cycle,
  timeZone,
}: ProposeMoveInput): MoveProposal {
  const activeBlocks = eventTimeBlocks.filter(
    (block) => block.status === 'active',
  );
  const movedBlocks =
    scope.kind === 'event'
      ? activeBlocks
      : activeBlocks.filter((block) => block.id === scope.eventTimeBlockId);
  const scopeStart =
    scope.kind === 'event' ? event.start : movedBlocks[0]?.startTime;
  if (scopeStart === undefined) {
    throw new MoveWindowClosedError();
  }

  // Not in the future: the scope started already or the target is now/past.
  if (
    !isEarlier({ left: now, right: scopeStart }) ||
    !isEarlier({ left: now, right: start })
  ) {
    throw new MoveWindowClosedError();
  }

  const deltaMs = millisecondsBetween({ start: scopeStart, end: start });
  const shift = ({ instant }: ShiftInput) =>
    addMilliseconds({ instant, milliseconds: deltaMs });
  const movedIds = new Set<string>(movedBlocks.map(({ id }) => id));

  const blocks = activeBlocks.map<ProposedBlockBounds>((block) => {
    const previous = { start: block.startTime, end: block.endTime };
    const moved = movedIds.has(block.id);
    return {
      eventTimeBlockId: block.id,
      label: block.label,
      moved,
      previous,
      proposed: moved
        ? {
            start: shift({ instant: previous.start }),
            end: shift({ instant: previous.end }),
          }
        : previous,
    };
  });

  const previousEvent = { start: event.start, end: event.end };
  let proposedEvent: InstantBounds;
  if (scope.kind === 'event') {
    proposedEvent = {
      start: shift({ instant: event.start }),
      end: shift({ instant: event.end }),
    };
  } else {
    // Stretch, never shrink: the Event keeps containing every block.
    proposedEvent = { ...previousEvent };
    for (const { moved, proposed } of blocks) {
      if (!moved) continue;
      if (isEarlier({ left: proposed.start, right: proposedEvent.start })) {
        proposedEvent.start = proposed.start;
      }
      if (isEarlier({ left: proposedEvent.end, right: proposed.end })) {
        proposedEvent.end = proposed.end;
      }
    }
  }

  if (!cycle.containsDate({ instant: proposedEvent.start, timeZone })) {
    throw new EventOutsideCycleError();
  }

  return {
    scope,
    deltaMs,
    previousEvent,
    proposedEvent,
    eventTimeBlocks: blocks,
  };
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

/** Strict interval intersection: touching ends do not overlap. */
function overlaps({ left, right }: BoundsPair) {
  return (
    isEarlier({ left: left.start, right: right.end }) &&
    isEarlier({ left: right.start, right: left.end })
  );
}

export function findMoveClashes({
  deltaMs,
  scopeAssignments,
  candidates,
}: FindMoveClashesInput): MoveClash[] {
  const clashes: MoveClash[] = [];
  for (const assignment of scopeAssignments) {
    const proposed = {
      start: addMilliseconds({
        instant: assignment.shiftStart,
        milliseconds: deltaMs,
      }),
      end: addMilliseconds({
        instant: assignment.shiftEnd,
        milliseconds: deltaMs,
      }),
    };
    const clashing = candidates.some(
      (candidate) =>
        candidate.volunteerId === assignment.volunteerId &&
        overlaps({
          left: proposed,
          right: { start: candidate.shiftStart, end: candidate.shiftEnd },
        }),
    );
    if (!clashing) continue;
    const {
      assignmentId,
      eventTimeBlockId,
      shiftId,
      volunteerId,
      volunteerName,
      ministryId,
      ministryName,
    } = assignment;
    clashes.push({
      assignmentId,
      eventTimeBlockId,
      shiftId,
      volunteerId,
      volunteerName,
      ministryId,
      ministryName,
      proposedStart: proposed.start,
      proposedEnd: proposed.end,
    });
  }
  return clashes;
}
