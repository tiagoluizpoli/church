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
import { EventOutsideCycleError } from '@/domain/errors/event-outside-cycle';
import { MoveWindowClosedError } from '@/domain/errors/move-window-closed';
import {
  findMoveClashes,
  type MoveScope,
  proposeMove,
} from '@/domain/services/event-move';

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const TIME_ZONE = 'America/Sao_Paulo';
const NOW = parseInstant({ value: '2026-10-01T15:00:00.000Z' });
// São Paulo is UTC-3 all year: 12:00Z is 09:00 local.
const at = (day: string, hour: number) =>
  parseInstant({
    value: `2026-10-${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  });

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
    start: at('18', 12),
    end: at('18', 15),
    status: 'scheduled',
  },
});
const block = (id: EventTimeBlockId, start: number, end: number) =>
  new EventTimeBlock({
    id,
    props: {
      churchId: CHURCH_ID,
      eventId: event.id,
      startTime: at('18', start),
      endTime: at('18', end),
      label: id === welcomeId ? 'Welcome' : 'Service',
    },
  });
const blocks = [block(welcomeId, 12, 13), block(serviceId, 13, 15)];

interface ProposeInput {
  scope: MoveScope;
  start: ReturnType<typeof at>;
}

const propose = ({ scope, start }: ProposeInput) =>
  proposeMove({
    scope,
    event,
    eventTimeBlocks: blocks,
    start,
    now: NOW,
    cycle,
    timeZone: TIME_ZONE,
  });

describe('proposeMove', () => {
  it('shifts the whole Event and every block by one delta, keeping durations', () => {
    const proposal = propose({ scope: { kind: 'event' }, start: at('20', 18) });

    expect(proposal.proposedEvent).toEqual({
      start: at('20', 18),
      end: at('20', 21),
    });
    expect(proposal.eventTimeBlocks.map(({ proposed }) => proposed)).toEqual([
      { start: at('20', 18), end: at('20', 19) },
      { start: at('20', 19), end: at('20', 21) },
    ]);
  });

  it('moves only one block and stretches, never shrinks, the Event', () => {
    const later = propose({
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
      start: at('18', 16),
    });
    const earlier = propose({
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: serviceId },
      start: at('18', 11),
    });

    // Welcome 16–17 now ends after the Event end (15) and Service stays.
    expect(later.proposedEvent).toEqual({
      start: at('18', 12),
      end: at('18', 17),
    });
    expect(later.eventTimeBlocks.map(({ moved }) => moved)).toEqual([
      true,
      false,
    ]);
    // Service 11–13 starts before the Event start (12): stretched.
    expect(earlier.proposedEvent).toEqual({
      start: at('18', 11),
      end: at('18', 15),
    });
  });

  it('refuses a stretched start day outside the Cycle', () => {
    expect(() =>
      propose({
        scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
        start: at('11', 12),
      }),
    ).toThrow(EventOutsideCycleError);
  });

  it('refuses a started scope and a target that is not in the future', () => {
    expect(() =>
      proposeMove({
        scope: { kind: 'event' },
        event,
        eventTimeBlocks: blocks,
        start: at('20', 18),
        now: at('18', 12),
        cycle,
        timeZone: TIME_ZONE,
      }),
    ).toThrow(MoveWindowClosedError);
    expect(() => propose({ scope: { kind: 'event' }, start: NOW })).toThrow(
      MoveWindowClosedError,
    );
  });
});

describe('findMoveClashes', () => {
  const volunteerId = 'v1' as VolunteerId;
  const scopeAssignments = [
    {
      assignmentId: 'a1' as AssignmentId,
      eventTimeBlockId: welcomeId,
      shiftId: 's1' as ShiftId,
      volunteerId,
      volunteerName: 'Ana',
      ministryId: 'm1' as MinistryId,
      ministryName: 'Music',
      shiftStart: at('18', 12),
      shiftEnd: at('18', 13),
    },
  ];
  const deltaMs = 2 * 24 * 3_600_000;

  it('clashes on strict overlap and allows touching ends', () => {
    const overlapping = findMoveClashes({
      deltaMs,
      scopeAssignments,
      candidates: [
        { volunteerId, shiftStart: at('20', 12), shiftEnd: at('20', 14) },
      ],
    });
    const touching = findMoveClashes({
      deltaMs,
      scopeAssignments,
      candidates: [
        { volunteerId, shiftStart: at('20', 11), shiftEnd: at('20', 12) },
        { volunteerId, shiftStart: at('20', 13), shiftEnd: at('20', 14) },
      ],
    });

    expect(overlapping).toHaveLength(1);
    expect(overlapping[0]).toMatchObject({
      proposedStart: at('20', 12),
      proposedEnd: at('20', 13),
    });
    expect(touching).toEqual([]);
  });

  it('ignores another Volunteer', () => {
    expect(
      findMoveClashes({
        deltaMs,
        scopeAssignments,
        candidates: [
          {
            volunteerId: 'v2' as VolunteerId,
            shiftStart: at('20', 12),
            shiftEnd: at('20', 14),
          },
        ],
      }),
    ).toEqual([]);
  });
});
