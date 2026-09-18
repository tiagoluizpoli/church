import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deriveEventDates,
  enumerateDates,
  eventMatchesDateSpan,
  eventOccursOnDay,
  eventSlotsOnDay,
} from './cycle-builder-date.utils';
import type {
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

/**
 * The Church Timezone here is São Paulo (west of UTC) throughout, passed
 * explicitly to every call. The ambient process `TZ` is pinned to an
 * east-of-UTC zone that shares no offset with São Paulo or UTC — proving the
 * grouping comes from the Church Timezone argument, never the browser's/
 * process's own zone (a 22:00 Friday → 01:00 Saturday Event must be a Friday
 * Event regardless of who is looking or from where).
 */
const ORIGINAL_TZ = process.env.TZ;
const CHURCH_TIMEZONE = 'America/Sao_Paulo';

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
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
    start: '2027-01-04T03:00:00.000Z',
    end: '2027-01-05T02:59:59.999Z',
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
  it('gives a one-church-local-day event exactly one column', () => {
    expect(
      deriveEventDates({
        events: [makeEvent()],
        timeZone: CHURCH_TIMEZONE,
      }),
    ).toEqual(['2027-01-04']);
  });

  it('does not grow a phantom next day for the real Janeiro cycle', () => {
    const events = [
      makeEvent(),
      makeEvent({
        eventId: 'event-2',
        title: 'segunda da benção',
        start: '2027-01-11T03:00:00.000Z',
        end: '2027-01-12T02:59:59.999Z',
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
    expect(deriveEventDates({ events, timeZone: CHURCH_TIMEZONE })).toEqual([
      '2027-01-04',
      '2027-01-11',
    ]);
  });

  it('collapses two slots on one day into a single column', () => {
    const event = makeEvent({
      slots: [
        makeSlot({ slotId: 'manha', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'tarde', startTime: '2027-01-04T19:00:00.000Z' }),
      ],
    });

    expect(
      deriveEventDates({ events: [event], timeZone: CHURCH_TIMEZONE }),
    ).toEqual(['2027-01-04']);
  });

  it('keeps a column for an event that has no slots yet', () => {
    expect(
      deriveEventDates({
        events: [makeEvent({ slots: [] })],
        timeZone: CHURCH_TIMEZONE,
      }),
    ).toEqual(['2027-01-04']);
  });

  it('lists each day of a genuinely multi-day event that serves on both', () => {
    const event = makeEvent({
      end: '2027-01-06T02:59:59.999Z',
      slots: [
        makeSlot({ slotId: 'day-1', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'day-2', startTime: '2027-01-05T12:00:00.000Z' }),
      ],
    });

    expect(
      deriveEventDates({ events: [event], timeZone: CHURCH_TIMEZONE }),
    ).toEqual(['2027-01-04', '2027-01-05']);
  });
});

describe('a 22:00 Friday → 01:00 Saturday church-local Event', () => {
  // 22:00 on Friday 2027-01-08 in São Paulo (UTC-3) is 01:00Z Saturday;
  // 01:00 Saturday church-local is 04:00Z Saturday. FR-*: the slot renders
  // only under its start CalendarDay, Friday — never also under Saturday's
  // column, which is what US4 (#151) calls "a Friday Event".
  const lateFridaySlot = makeSlot({
    slotId: 'late-friday',
    startTime: '2027-01-09T01:00:00.000Z',
    endTime: '2027-01-09T04:00:00.000Z',
    shifts: [
      makeShift({
        shiftId: 'shift-late-friday',
        startTime: '2027-01-09T01:00:00.000Z',
        endTime: '2027-01-09T04:00:00.000Z',
      }),
    ],
  });
  const event = makeEvent({
    eventId: 'late-friday-event',
    start: '2027-01-09T01:00:00.000Z',
    end: '2027-01-09T04:00:00.000Z',
    slots: [lateFridaySlot],
  });

  it('renders the slot under Friday, not the UTC/next-day column', () => {
    expect(
      eventSlotsOnDay({ event, day: '2027-01-08', timeZone: CHURCH_TIMEZONE }),
    ).toEqual([lateFridaySlot]);
    expect(
      eventSlotsOnDay({ event, day: '2027-01-09', timeZone: CHURCH_TIMEZONE }),
    ).toEqual([]);
  });

  it('matches a "starts" date-span filter on Friday, not Saturday', () => {
    expect(
      eventMatchesDateSpan({
        event,
        mode: 'starts',
        rangeStart: '2027-01-08',
        rangeEnd: '2027-01-08',
        timeZone: CHURCH_TIMEZONE,
      }),
    ).toBe(true);
    expect(
      eventMatchesDateSpan({
        event,
        mode: 'starts',
        rangeStart: '2027-01-09',
        rangeEnd: '2027-01-09',
        timeZone: CHURCH_TIMEZONE,
      }),
    ).toBe(false);
  });
});

describe('eventOccursOnDay', () => {
  it('claims only the day it serves, so a shift renders in one column', () => {
    const event = makeEvent();
    expect(
      eventOccursOnDay({ event, day: '2027-01-04', timeZone: CHURCH_TIMEZONE }),
    ).toBe(true);
    expect(
      eventOccursOnDay({ event, day: '2027-01-05', timeZone: CHURCH_TIMEZONE }),
    ).toBe(false);
  });

  it('claims every day of a genuinely multi-day event that has a slot there', () => {
    // "Genuinely multi-day" means slots on both days — an event whose bounds
    // merely span two days but which only has a slot on the first must not
    // claim the second (that shape is the phantom-day bug this guards
    // against; see the Friday/Saturday case below).
    const event = makeEvent({
      end: '2027-01-06T02:59:59.999Z',
      slots: [
        makeSlot({ slotId: 'day-1', startTime: '2027-01-04T12:00:00.000Z' }),
        makeSlot({ slotId: 'day-2', startTime: '2027-01-05T12:00:00.000Z' }),
      ],
    });
    expect(
      eventOccursOnDay({ event, day: '2027-01-05', timeZone: CHURCH_TIMEZONE }),
    ).toBe(true);
  });

  it('claims only Friday for a 22:00 Friday → 01:00 Saturday event, never the phantom Saturday', () => {
    // Regression for the bug a raw [start, end] bounds check let through: the
    // event's own start/end cross church-local midnight, but it must
    // still resolve to exactly one day — its start day — not both.
    const lateFridaySlot = makeSlot({
      slotId: 'late-friday',
      startTime: '2027-01-09T01:00:00.000Z',
      endTime: '2027-01-09T04:00:00.000Z',
      shifts: [
        makeShift({
          shiftId: 'shift-late-friday',
          startTime: '2027-01-09T01:00:00.000Z',
          endTime: '2027-01-09T04:00:00.000Z',
        }),
      ],
    });
    const event = makeEvent({
      eventId: 'late-friday-event',
      start: '2027-01-09T01:00:00.000Z',
      end: '2027-01-09T04:00:00.000Z',
      slots: [lateFridaySlot],
    });

    expect(
      eventOccursOnDay({ event, day: '2027-01-08', timeZone: CHURCH_TIMEZONE }),
    ).toBe(true);
    expect(
      eventOccursOnDay({ event, day: '2027-01-09', timeZone: CHURCH_TIMEZONE }),
    ).toBe(false);
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

    expect(
      eventSlotsOnDay({ event, day: '2027-01-04', timeZone: CHURCH_TIMEZONE }),
    ).toEqual([eveningSlot]);
    expect(
      eventSlotsOnDay({ event, day: '2027-01-05', timeZone: CHURCH_TIMEZONE }),
    ).toEqual([]);
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
      end: '2027-01-06T02:59:59.999Z',
      slots: [dayOne, dayTwo],
    });

    // Rendering the whole slot list per column is what made one assignment
    // look like it had landed on several days.
    expect(
      eventSlotsOnDay({ event, day: '2027-01-04', timeZone: CHURCH_TIMEZONE }),
    ).toEqual([dayOne]);
    expect(
      eventSlotsOnDay({ event, day: '2027-01-05', timeZone: CHURCH_TIMEZONE }),
    ).toEqual([dayTwo]);
  });
});

describe('eventMatchesDateSpan', () => {
  it('reads the event span in church-local days', () => {
    const event = makeEvent();
    // The Jan 5 UTC end bound must not push the event outside a Jan 4 range.
    expect(
      eventMatchesDateSpan({
        event,
        mode: 'within',
        rangeStart: '2027-01-04',
        rangeEnd: '2027-01-04',
        timeZone: CHURCH_TIMEZONE,
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
        timeZone: CHURCH_TIMEZONE,
      }),
    ).toBe(false);
  });
});

describe('enumerateDates', () => {
  it('walks cycle bounds without dropping or adding a day', () => {
    const dates = enumerateDates({
      startDate: '2027-01-01',
      endDate: '2027-01-31',
    });

    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe('2027-01-01');
    expect(dates.at(-1)).toBe('2027-01-31');
  });
});
