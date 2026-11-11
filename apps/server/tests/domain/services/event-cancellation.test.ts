import { NotFoundError } from '@church/core';
import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  AssignmentId,
  EventTimeBlockId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { AdminCancellationWindowClosedError } from '@/domain/errors/admin-cancellation-window-closed';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import {
  type CancellationScopeAssignment,
  resolveCancellationScope,
  summarizeCancellationImpact,
} from '@/domain/services/event-cancellation';

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const at = (hour: number) =>
  parseInstant({
    value: `2026-10-18T${String(hour).padStart(2, '0')}:00:00.000Z`,
  });

const welcomeId = '33333333-3333-4333-8333-333333333331' as EventTimeBlockId;
const serviceId = '33333333-3333-4333-8333-333333333332' as EventTimeBlockId;
const closingId = '33333333-3333-4333-8333-333333333333' as EventTimeBlockId;
const event = new Event({
  props: {
    churchId: CHURCH_ID,
    cycleId: '22222222-2222-4222-8222-222222222222',
    title: 'Sunday',
    start: at(12),
    end: at(16),
    status: 'scheduled',
  },
});

interface BlockInput {
  id: EventTimeBlockId;
  start: number;
  end: number;
  status?: 'active' | 'cancelled';
}

const block = ({ id, start, end, status }: BlockInput) =>
  new EventTimeBlock({
    id,
    props: {
      churchId: CHURCH_ID,
      eventId: event.id,
      startTime: at(start),
      endTime: at(end),
      status,
    },
  });

const blocks = [
  block({ id: welcomeId, start: 12, end: 13 }),
  block({ id: serviceId, start: 13, end: 15 }),
  block({ id: closingId, start: 15, end: 16, status: 'cancelled' }),
];

describe('resolveCancellationScope', () => {
  it('covers the Event bounds and its active blocks before the Event starts', () => {
    expect(
      resolveCancellationScope({
        scope: { kind: 'event' },
        event,
        eventTimeBlocks: blocks,
        now: at(11),
      }),
    ).toEqual({
      start: at(12),
      end: at(16),
      eventTimeBlockIds: [welcomeId, serviceId],
    });
  });

  it('closes the Event window at its start', () => {
    expect(() =>
      resolveCancellationScope({
        scope: { kind: 'event' },
        event,
        eventTimeBlocks: blocks,
        now: at(12),
      }),
    ).toThrow(AdminCancellationWindowClosedError);
  });

  it('judges a block by its own start while a sibling has started', () => {
    expect(
      resolveCancellationScope({
        scope: { kind: 'eventTimeBlock', eventTimeBlockId: serviceId },
        event,
        eventTimeBlocks: blocks,
        now: at(12),
      }),
    ).toEqual({ start: at(13), end: at(15), eventTimeBlockIds: [serviceId] });
    expect(() =>
      resolveCancellationScope({
        scope: { kind: 'eventTimeBlock', eventTimeBlockId: serviceId },
        event,
        eventTimeBlocks: blocks,
        now: at(13),
      }),
    ).toThrow(AdminCancellationWindowClosedError);
  });

  it('refuses an already-cancelled block and a block of another Event', () => {
    expect(() =>
      resolveCancellationScope({
        scope: { kind: 'eventTimeBlock', eventTimeBlockId: closingId },
        event,
        eventTimeBlocks: blocks,
        now: at(11),
      }),
    ).toThrow(IllegalStateTransitionError);
    expect(() =>
      resolveCancellationScope({
        scope: {
          kind: 'eventTimeBlock',
          eventTimeBlockId:
            '44444444-4444-4444-8444-444444444444' as EventTimeBlockId,
        },
        event,
        eventTimeBlocks: blocks,
        now: at(11),
      }),
    ).toThrow(NotFoundError);
  });
});

const music = '55555555-5555-4555-8555-555555555551' as MinistryId;
const ushers = '55555555-5555-4555-8555-555555555552' as MinistryId;
const media = '55555555-5555-4555-8555-555555555553' as MinistryId;

interface RowInput {
  volunteer: string;
  ministryId: MinistryId;
  published: boolean;
  openSwapRequest?: boolean;
}

let rowNumber = 0;
const row = ({
  volunteer,
  ministryId,
  published,
  openSwapRequest = false,
}: RowInput): CancellationScopeAssignment => {
  rowNumber += 1;
  return {
    assignmentId: `assignment-${rowNumber}` as AssignmentId,
    eventTimeBlockId: welcomeId,
    shiftId: `shift-${rowNumber}` as ShiftId,
    volunteerId: volunteer as VolunteerId,
    userId: `user-${volunteer}` as UserId,
    ministryId,
    ministryName: ministryId,
    roleName: 'Usher',
    sectorName: 'Geral',
    shiftStart: at(12),
    shiftEnd: at(13),
    published,
    openSwapRequest,
  };
};

describe('summarizeCancellationImpact', () => {
  it('counts distinct published Volunteers per participating Ministry and every open request', () => {
    const resolved = resolveCancellationScope({
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
      event,
      eventTimeBlocks: blocks,
      now: at(11),
    });

    const impact = summarizeCancellationImpact({
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
      event,
      resolved,
      assignments: [
        row({ volunteer: 'ana', ministryId: music, published: true }),
        row({
          volunteer: 'ana',
          ministryId: music,
          published: true,
          openSwapRequest: true,
        }),
        row({ volunteer: 'ana', ministryId: ushers, published: true }),
        row({ volunteer: 'bia', ministryId: music, published: false }),
        row({ volunteer: 'caio', ministryId: ushers, published: true }),
      ],
      ministries: [
        { id: music, name: 'Music' },
        { id: ushers, name: 'Ushers' },
        { id: media, name: 'Media' },
      ],
    });

    expect(impact).toEqual({
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
      eventId: event.id,
      eventTitle: 'Sunday',
      start: at(12),
      end: at(13),
      volunteerCount: 2,
      ministryCount: 2,
      ministries: [
        { ministryId: music, ministryName: 'Music', volunteerCount: 1 },
        { ministryId: ushers, ministryName: 'Ushers', volunteerCount: 2 },
        { ministryId: media, ministryName: 'Media', volunteerCount: 0 },
      ],
      openSwapRequestCount: 1,
    });
  });
});
