import { NotFoundError } from '@church/core';
import { parseCalendarDay, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  AssignmentId,
  EventTimeBlockId,
  MinistryId,
  ShiftId,
  VolunteerId,
} from '@/domain/branded-ids';
import { Cycle } from '@/domain/entities/cycle';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { EditWindowClosedError } from '@/domain/errors/edit-window-closed';
import { EventGraphRuleError } from '@/domain/errors/event-graph-rule';
import { StaffedEventTimeBlockDropError } from '@/domain/errors/staffed-event-time-block-drop';
import {
  type EditProposal,
  findEditClashes,
  proposeEdit,
  proposeShiftBounds,
} from '@/domain/services/event-edit';
import type { MoveScopeAssignment } from '@/domain/services/event-move';

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const TIME_ZONE = 'America/Sao_Paulo';
// São Paulo is UTC-3 all year: 12:00Z is 09:00 local.
const at = (hour: number, minute = 0) =>
  parseInstant({
    value: `2026-10-18T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`,
  });
const BEFORE = parseInstant({ value: '2026-10-01T15:00:00.000Z' });

const cycle = new Cycle({
  props: {
    churchId: CHURCH_ID,
    name: 'October',
    startDate: parseCalendarDay({ value: '2026-10-12' }),
    endDate: parseCalendarDay({ value: '2026-10-25' }),
    state: 'sent',
  },
});
const welcomeId = '33333333-3333-4333-8333-333333333331' as EventTimeBlockId;
const serviceId = '33333333-3333-4333-8333-333333333332' as EventTimeBlockId;
const event = new Event({
  props: {
    churchId: CHURCH_ID,
    cycleId: cycle.id,
    title: 'Sunday',
    start: at(12),
    end: at(15),
    status: 'scheduled',
  },
});
const block = (
  id: EventTimeBlockId,
  label: string,
  start: number,
  end: number,
) =>
  new EventTimeBlock({
    id,
    props: {
      churchId: CHURCH_ID,
      eventId: event.id,
      startTime: at(start),
      endTime: at(end),
      label,
    },
  });
const stored = [
  block(welcomeId, 'Welcome', 12, 13),
  block(serviceId, 'Service', 13, 15),
];

interface ProposeInput {
  now?: ReturnType<typeof at>;
  staffedBlockIds?: EventTimeBlockId[];
  end?: number;
  blocks?: {
    id?: EventTimeBlockId;
    label: string;
    start: number;
    end: number;
  }[];
}

function propose({
  now = BEFORE,
  staffedBlockIds = [],
  end = 17,
  blocks = [
    { id: welcomeId, label: 'Welcome', start: 12, end: 13 },
    { id: serviceId, label: 'Service', start: 13, end: 17 },
  ],
}: ProposeInput = {}): EditProposal {
  return proposeEdit({
    event,
    eventTimeBlocks: stored,
    proposed: {
      start: at(12),
      end: at(end),
      eventTimeBlocks: blocks.map(({ id, label, start, end: blockEnd }) => ({
        id,
        label,
        startTime: at(start),
        endTime: at(blockEnd),
      })),
    },
    staffedBlockIds,
    now,
    cycle,
    timeZone: TIME_ZONE,
  });
}

describe('proposeEdit', () => {
  it('pairs each kept block with its previous bounds, lists added blocks and drops unnamed unstaffed ones', () => {
    const proposal = propose({
      blocks: [
        { id: serviceId, label: 'Service', start: 13, end: 16 },
        { label: 'Lunch', start: 16, end: 17 },
      ],
    });

    expect(proposal).toEqual({
      previousEvent: { start: at(12), end: at(15) },
      proposedEvent: { start: at(12), end: at(17) },
      eventTimeBlocks: [
        {
          eventTimeBlockId: serviceId,
          label: 'Service',
          change: 'kept',
          previous: { start: at(13), end: at(15) },
          proposed: { start: at(13), end: at(16) },
        },
        {
          eventTimeBlockId: undefined,
          label: 'Lunch',
          change: 'added',
          previous: undefined,
          proposed: { start: at(16), end: at(17) },
        },
        {
          eventTimeBlockId: welcomeId,
          label: 'Welcome',
          change: 'dropped',
          previous: { start: at(12), end: at(13) },
          proposed: undefined,
        },
      ],
    });
  });

  it('allows an Event that is running', () => {
    expect(propose({ now: at(14) }).proposedEvent).toEqual({
      start: at(12),
      end: at(17),
    });
  });

  it('refuses an Event that has ended', () => {
    expect(() => propose({ now: at(15) })).toThrow(EditWindowClosedError);
  });

  it('refuses a proposal that breaks the final-graph rules', () => {
    expect(() =>
      propose({
        end: 16,
        blocks: [{ id: serviceId, label: 'Service', start: 13, end: 17 }],
      }),
    ).toThrow(EventGraphRuleError);
  });

  it('refuses a block id that is not one of the Event’s active blocks', () => {
    expect(() =>
      propose({
        blocks: [
          {
            id: '33333333-3333-4333-8333-333333333339' as EventTimeBlockId,
            label: 'Service',
            start: 13,
            end: 17,
          },
        ],
      }),
    ).toThrow(NotFoundError);
  });

  it('refuses dropping a staffed block', () => {
    expect(() =>
      propose({
        staffedBlockIds: [welcomeId],
        blocks: [{ id: serviceId, label: 'Service', start: 13, end: 17 }],
      }),
    ).toThrow(StaffedEventTimeBlockDropError);
  });
});

describe('proposeShiftBounds', () => {
  it('scales the Shift with its block, so a whole-block Shift stays whole', () => {
    expect(
      proposeShiftBounds({
        previousBlock: { start: at(13), end: at(15) },
        proposedBlock: { start: at(13), end: at(17) },
        shift: { start: at(14), end: at(15) },
        now: BEFORE,
      }),
    ).toEqual({ start: at(15), end: at(17) });
    expect(
      proposeShiftBounds({
        previousBlock: { start: at(13), end: at(15) },
        proposedBlock: { start: at(12, 30), end: at(14, 30) },
        shift: { start: at(13), end: at(15) },
        now: BEFORE,
      }),
    ).toEqual({ start: at(12, 30), end: at(14, 30) });
  });

  it('never moves a past instant: an ended Shift stays, a running one keeps its start and its end follows the rest of the block', () => {
    // Block 18–20 extended to 22 at 19:30.
    const extend = (shift: { start: number; end: number }) =>
      proposeShiftBounds({
        previousBlock: { start: at(18), end: at(20) },
        proposedBlock: { start: at(18), end: at(22) },
        shift: { start: at(shift.start), end: at(shift.end) },
        now: at(19, 30),
      });

    expect(extend({ start: 18, end: 19 })).toEqual({
      start: at(18),
      end: at(19),
    });
    expect(extend({ start: 19, end: 20 })).toEqual({
      start: at(19),
      end: at(22),
    });
    expect(extend({ start: 18, end: 20 })).toEqual({
      start: at(18),
      end: at(22),
    });
  });

  it('spreads Shifts still to come over the rest of a running block', () => {
    // At 18:30, 18:30–20 becomes 18:30–21:30: 19–20 keeps its share of it.
    expect(
      proposeShiftBounds({
        previousBlock: { start: at(18), end: at(20) },
        proposedBlock: { start: at(18), end: at(21, 30) },
        shift: { start: at(19), end: at(20) },
        now: at(18, 30),
      }),
    ).toEqual({ start: at(19, 30), end: at(21, 30) });
  });
});

const assignment = (
  id: string,
  volunteer: string,
  eventTimeBlockId: EventTimeBlockId,
  start: number,
  end: number,
): MoveScopeAssignment => ({
  assignmentId: id as AssignmentId,
  eventTimeBlockId,
  shiftId: `shift-${id}` as ShiftId,
  volunteerId: volunteer as VolunteerId,
  volunteerName: volunteer,
  ministryId: 'ministry' as MinistryId,
  ministryName: 'Media',
  shiftStart: at(start),
  shiftEnd: at(end),
});

describe('findEditClashes', () => {
  it('withdraws an Assignment whose new Shift overlaps the Volunteer’s other active Assignment', () => {
    const proposal = propose();
    const clashes = findEditClashes({
      proposal,
      scopeAssignments: [
        assignment('a1', 'ana', serviceId, 13, 15),
        assignment('a2', 'bia', serviceId, 13, 15),
      ],
      now: BEFORE,
      candidates: [
        {
          volunteerId: 'ana' as VolunteerId,
          shiftStart: at(16),
          shiftEnd: at(18),
        },
        // Touching ends are compatible.
        {
          volunteerId: 'bia' as VolunteerId,
          shiftStart: at(17),
          shiftEnd: at(18),
        },
      ],
    });

    expect(clashes).toEqual([
      {
        assignmentId: 'a1',
        eventTimeBlockId: serviceId,
        shiftId: 'shift-a1',
        volunteerId: 'ana',
        volunteerName: 'ana',
        ministryId: 'ministry',
        ministryName: 'Media',
        proposedStart: at(13),
        proposedEnd: at(17),
      },
    ]);
  });

  it('keeps the earlier of two of the Event’s own Assignments that come to overlap', () => {
    const proposal = propose({
      blocks: [
        { id: welcomeId, label: 'Welcome', start: 12, end: 14 },
        { id: serviceId, label: 'Service', start: 13, end: 17 },
      ],
    });
    const clashes = findEditClashes({
      proposal,
      scopeAssignments: [
        assignment('a1', 'ana', welcomeId, 12, 13),
        assignment('a2', 'ana', serviceId, 13, 15),
      ],
      candidates: [],
      now: BEFORE,
    });

    expect(clashes.map(({ assignmentId }) => assignmentId)).toEqual(['a2']);
  });

  it('withdraws a running Shift’s Assignment whose end follows the block into a clash, its start kept', () => {
    // At 13:30 Service 13–15 → 13–17: the rest of the block, 13:30–15, becomes
    // 13:30–17, so Ana's running 13–14 becomes 13–14:40 and Bia's 14–15 14:40–17.
    const clashes = findEditClashes({
      proposal: propose({ now: at(13, 30) }),
      scopeAssignments: [
        assignment('a1', 'ana', serviceId, 13, 14),
        assignment('a2', 'bia', serviceId, 14, 15),
      ],
      candidates: [
        {
          volunteerId: 'ana' as VolunteerId,
          shiftStart: at(14, 30),
          shiftEnd: at(16),
        },
        // Touching the new end is compatible.
        {
          volunteerId: 'bia' as VolunteerId,
          shiftStart: at(17),
          shiftEnd: at(18),
        },
      ],
      now: at(13, 30),
    });

    expect(
      clashes.map(({ assignmentId, proposedStart, proposedEnd }) => ({
        assignmentId,
        proposedStart,
        proposedEnd,
      })),
    ).toEqual([
      { assignmentId: 'a1', proposedStart: at(13), proposedEnd: at(14, 40) },
    ]);
  });
});
