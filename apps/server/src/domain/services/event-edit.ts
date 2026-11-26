import { NotFoundError } from '@church/core';
import {
  addMilliseconds,
  compareInstants,
  type Instant,
  millisecondsBetween,
} from '@church/time';
import type { EventTimeBlockId } from '../branded-ids';
import type { Cycle } from '../entities/cycle';
import type { Event } from '../entities/event';
import type { EventTimeBlock } from '../entities/event-time-block';
import { EditWindowClosedError } from '../errors/edit-window-closed';
import { StaffedEventTimeBlockDropError } from '../errors/staffed-event-time-block-drop';
import { assertEventGraph, type EventGraph } from './event-graph';
import {
  type InstantBounds,
  type InstantPair,
  type MoveClash,
  type MoveClashCandidate,
  type MoveScopeAssignment,
  overlaps,
} from './event-move';

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

/**
 * Computes an edit of a sent Event: allowed until the Event ends (a running
 * Event included), the proposal passes the final-graph rules, every named
 * block is one of the Event's active blocks and no staffed block is left out
 * (removing one is a cancel). Pure: reads nothing persisted.
 */
export function proposeEdit({
  event,
  eventTimeBlocks,
  proposed,
  staffedBlockIds,
  now,
  cycle,
  timeZone,
}: ProposeEditInput): EditProposal {
  if (compareInstants({ left: now, right: event.end }) >= 0) {
    throw new EditWindowClosedError();
  }

  const active = eventTimeBlocks.filter(({ status }) => status === 'active');
  const activeById = new Map(active.map((block) => [block.id, block]));
  for (const { id } of proposed.eventTimeBlocks) {
    if (id !== undefined && !activeById.has(id)) {
      throw new NotFoundError(`EventTimeBlock not found: ${id}`);
    }
  }
  assertEventGraph({ graph: proposed, cycle, timeZone });

  const keptIds = new Set(proposed.eventTimeBlocks.map(({ id }) => id));
  const dropped = active.filter(({ id }) => !keptIds.has(id));
  const staffedDrop = dropped.find(({ id }) => staffedBlockIds.includes(id));
  if (staffedDrop) {
    throw new StaffedEventTimeBlockDropError({
      eventTimeBlockId: staffedDrop.id,
    });
  }

  const boundsOf = ({ startTime, endTime }: EventTimeBlock) => ({
    start: startTime,
    end: endTime,
  });
  return {
    previousEvent: { start: event.start, end: event.end },
    proposedEvent: { start: proposed.start, end: proposed.end },
    eventTimeBlocks: [
      ...proposed.eventTimeBlocks.map<EditedBlockBounds>((block) => {
        const stored = block.id ? activeById.get(block.id) : undefined;
        return {
          eventTimeBlockId: block.id,
          label: block.label,
          change: stored ? 'kept' : 'added',
          previous: stored ? boundsOf(stored) : undefined,
          proposed: { start: block.startTime, end: block.endTime },
        };
      }),
      ...dropped.map<EditedBlockBounds>((block) => ({
        eventTimeBlockId: block.id,
        label: block.label,
        change: 'dropped',
        previous: boundsOf(block),
        proposed: undefined,
      })),
    ],
  };
}

export interface ProposeShiftBoundsInput {
  previousBlock: InstantBounds;
  proposedBlock: InstantBounds;
  shift: InstantBounds;
  now: Instant;
}

interface FollowInput {
  instant: Instant;
}

const later = ({ left, right }: InstantPair) =>
  compareInstants({ left, right }) >= 0 ? left : right;

/**
 * A Shift follows its block by keeping its share of the block's part still to
 * come: a whole-block Shift stays whole and equal parts stay equal, always
 * inside the new block. A past instant never moves: an ended Shift keeps its
 * times and a running one its start, while its end follows the block.
 */
export function proposeShiftBounds({
  previousBlock,
  proposedBlock,
  shift,
  now,
}: ProposeShiftBoundsInput): InstantBounds {
  const previousFrom = later({ left: previousBlock.start, right: now });
  const proposedFrom = later({ left: proposedBlock.start, right: now });
  const previousLength = millisecondsBetween({
    start: previousFrom,
    end: previousBlock.end,
  });
  const proposedLength = millisecondsBetween({
    start: proposedFrom,
    end: proposedBlock.end,
  });
  // A future instant lies after previousFrom, so previousLength is positive.
  const follow = ({ instant }: FollowInput) =>
    compareInstants({ left: instant, right: now }) <= 0
      ? instant
      : addMilliseconds({
          instant: proposedFrom,
          milliseconds: Math.round(
            (millisecondsBetween({ start: previousFrom, end: instant }) *
              proposedLength) /
              previousLength,
          ),
        });
  return {
    start: follow({ instant: shift.start }),
    end: follow({ instant: shift.end }),
  };
}

export interface FindEditClashesInput {
  proposal: EditProposal;
  /** The active Assignments of the edited Event. */
  scopeAssignments: MoveScopeAssignment[];
  /** Must exclude every Assignment of the edited Event. */
  candidates: MoveClashCandidate[];
  now: Instant;
}

interface ProposedAssignment {
  assignment: MoveScopeAssignment;
  bounds: InstantBounds;
}

/**
 * The Event's Assignments whose retimed Shift would double-book their
 * Volunteer, against the rest of the Church and against each other: of two of
 * the Event's own Assignments that come to overlap, the earlier one is kept.
 */
export function findEditClashes({
  proposal,
  scopeAssignments,
  candidates,
  now,
}: FindEditClashesInput): MoveClash[] {
  const blocks = new Map(
    proposal.eventTimeBlocks.map((block) => [block.eventTimeBlockId, block]),
  );
  const retimed = scopeAssignments.map<ProposedAssignment>((assignment) => {
    const block = blocks.get(assignment.eventTimeBlockId);
    const shift = { start: assignment.shiftStart, end: assignment.shiftEnd };
    // Only a kept block can hold an Assignment: dropping a staffed one is refused.
    const bounds =
      block?.previous && block.proposed
        ? proposeShiftBounds({
            previousBlock: block.previous,
            proposedBlock: block.proposed,
            shift,
            now,
          })
        : shift;
    return { assignment, bounds };
  });
  retimed.sort(
    (left, right) =>
      compareInstants({ left: left.bounds.start, right: right.bounds.start }) ||
      left.assignment.assignmentId.localeCompare(right.assignment.assignmentId),
  );

  const held = candidates.map(({ volunteerId, shiftStart, shiftEnd }) => ({
    volunteerId,
    bounds: { start: shiftStart, end: shiftEnd },
  }));
  const clashes: MoveClash[] = [];
  for (const { assignment, bounds } of retimed) {
    const clashing = held.some(
      (other) =>
        other.volunteerId === assignment.volunteerId &&
        overlaps({ left: bounds, right: other.bounds }),
    );
    if (!clashing) {
      held.push({ volunteerId: assignment.volunteerId, bounds });
      continue;
    }
    const { shiftStart: _start, shiftEnd: _end, ...identity } = assignment;
    clashes.push({
      ...identity,
      proposedStart: bounds.start,
      proposedEnd: bounds.end,
    });
  }
  return clashes;
}
