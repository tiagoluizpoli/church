import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deriveEventDates,
  enumerateDates,
  eventMatchesDateSpan,
  eventOccursOnDay,
  eventSlotsOnDay,
} from './cycle-builder-matrix.utils';
import type {
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

/**
 * Every case here runs in a west-of-UTC zone on purpose. The bug these guard
 * against is invisible at UTC: it only appears once a church-local day and a
 * UTC day stop lining up.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function makeShift(
  overrides: Partial<CycleBuilderShiftSummary> = {},
): CycleBuilderShiftSummary {
  return {
    shiftId: 'shift-1',
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    requiredCount: 1,
    assignedCount: 0,
    requirements: [],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeSlot(
  overrides: Partial<CycleBuilderSlotSummary> = {},
): CycleBuilderSlotSummary {
  return {
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    included: true,
    requiredCount: 1,
    assignedCount: 0,
    shiftCount: 1,
    shifts: [makeShift()],
    ...overrides,
  };
}

/**
 * Mirrors the real `teste` row: a single church-local Monday stored as
 * local-midnight → local 23:59, which in UTC-3 straddles two UTC dates.
 */
function makeEvent(
  overrides: Partial<CycleBuilderEventSummary> = {},
): CycleBuilderEventSummary {
  return {
    participationId: 'participation-1',
    state: 'rostering',
    eventId: 'event-1',
    title: 'teste',
    startDate: '2027-01-04T03:00:00.000Z',
    endDate: '2027-01-05T02:59:59.999Z',
    status: 'draft',
    eventType: 'hourly',
    fillRatio: 0,
    requiredCount: 1,
    assignedCount: 0,
    slotCount: 1,
    slots: [makeSlot()],
    ...overrides,
  };
}

describe('deriveEventDates', () => {
  it('gives a one-local-day event exactly one column', () => {
    expect(deriveEventDates({ events: [makeEvent()] })).toEqual(['2027-01-04']);
  });

  it('does not grow a phantom next day for the real Janeiro cycle', () => {
    const events = [
      makeEvent(),
      makeEvent({
        eventId: 'event-2',
        title: 'segunda da benção',
        startDate: '2027-01-11T03:00:00.000Z',
        endDate: '2027-01-12T02:59:59.999Z',
        slots: [
          makeSlot({
            slotId: 'slot-3',
            startTime: '2027-01-11T12:00:00.000Z',
            endTime: '2027-01-11T15:00:00.000Z',
            shifts: [
              makeShift({
                shiftId: 'shift-3',
                startTime: '2027-01-11T12:00:00.000Z',
                endTime: '2027-01-11T15:00:00.000Z',
              }),
            ],
          }),
        ],
      }),
    ];

    // No 2027-01-05, no 2027-01-12.
    expect(deriveEventDates({ events })).toEqual(['2027-01-04', '2027-01-11']);
  });

  it('collapses two slots on one day into a single column', () => {
    const event = makeEvent({
      slots: [
        makeSlot({ slotId: 'manha', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'tarde', startTime: '2027-01-04T19:00:00.000Z' }),
      ],
    });

    expect(deriveEventDates({ events: [event] })).toEqual(['2027-01-04']);
  });

  it('keeps a column for an event that has no slots yet', () => {
    expect(deriveEventDates({ events: [makeEvent({ slots: [] })] })).toEqual([
      '2027-01-04',
    ]);
  });

  it('lists each day of a genuinely multi-day event that serves on both', () => {
    const event = makeEvent({
      endDate: '2027-01-06T02:59:59.999Z',
      slots: [
        makeSlot({ slotId: 'day-1', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'day-2', startTime: '2027-01-05T12:00:00.000Z' }),
      ],
    });

    expect(deriveEventDates({ events: [event] })).toEqual([
      '2027-01-04',
      '2027-01-05',
    ]);
  });
});

describe('eventOccursOnDay', () => {
  it('claims only the day it serves, so a shift renders in one column', () => {
    const event = makeEvent();
    expect(eventOccursOnDay({ event, day: '2027-01-04' })).toBe(true);
    expect(eventOccursOnDay({ event, day: '2027-01-05' })).toBe(false);
  });

  it('claims every day of a genuinely multi-day event', () => {
    const event = makeEvent({ endDate: '2027-01-06T02:59:59.999Z' });
    expect(eventOccursOnDay({ event, day: '2027-01-05' })).toBe(true);
  });
});

describe('eventSlotsOnDay', () => {
  it('keeps an evening slot on the day it is served, not the next UTC day', () => {
    // 21:00 local Monday = 00:00Z Tuesday — the shape that also breaks the
    // tailoring page's day grouping.
    const eveningSlot = makeSlot({
      slotId: 'noite',
      startTime: '2027-01-05T00:00:00.000Z',
      endTime: '2027-01-05T02:00:00.000Z',
    });
    const event = makeEvent({ slots: [eveningSlot] });

    expect(eventSlotsOnDay({ event, day: '2027-01-04' })).toEqual([
      eveningSlot,
    ]);
    expect(eventSlotsOnDay({ event, day: '2027-01-05' })).toEqual([]);
  });

  it('gives each day of a multi-day event only its own slots', () => {
    const dayOne = makeSlot({
      slotId: 'day-1',
      startTime: '2027-01-04T12:00:00.000Z',
    });
    const dayTwo = makeSlot({
      slotId: 'day-2',
      startTime: '2027-01-05T12:00:00.000Z',
    });
    const event = makeEvent({
      endDate: '2027-01-06T02:59:59.999Z',
      slots: [dayOne, dayTwo],
    });

    // Rendering the whole slot list per column is what made one assignment
    // look like it had landed on several days.
    expect(eventSlotsOnDay({ event, day: '2027-01-04' })).toEqual([dayOne]);
    expect(eventSlotsOnDay({ event, day: '2027-01-05' })).toEqual([dayTwo]);
  });
});

describe('eventMatchesDateSpan', () => {
  it('reads the event span in local days', () => {
    const event = makeEvent();
    // The Jan 5 UTC end bound must not push the event outside a Jan 4 range.
    expect(
      eventMatchesDateSpan({
        event,
        mode: 'within',
        rangeStart: '2027-01-04',
        rangeEnd: '2027-01-04',
      }),
    ).toBe(true);
  });

  it('still excludes an event outside the range', () => {
    expect(
      eventMatchesDateSpan({
        event: makeEvent(),
        mode: 'starts',
        rangeStart: '2027-01-06',
        rangeEnd: '2027-01-31',
      }),
    ).toBe(false);
  });
});

describe('enumerateDates', () => {
  it('walks cycle bounds without dropping or adding a day', () => {
    const dates = enumerateDates({
      startDate: '2027-01-01T00:00:00.000Z',
      endDate: '2027-01-31T00:00:00.000Z',
    });

    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe('2027-01-01');
    expect(dates.at(-1)).toBe('2027-01-31');
  });
});
