import {
  type CalendarDay,
  parseCalendarDay,
  parseInstant,
  today,
} from '@church/time';
import { describe, expect, it } from 'vitest';
import { InvalidRecurrenceError } from '@/domain/errors/invalid-recurrence';
import {
  assertRecurrence,
  expandRecurrence,
  type Recurrence,
  recurrenceNamesDay,
} from '@/domain/recurrence';

function day(value: string): CalendarDay {
  return parseCalendarDay({ value });
}

function expand(recurrence: Recurrence, start: string, end: string) {
  return expandRecurrence({ recurrence, start: day(start), end: day(end) });
}

describe('expandRecurrence', () => {
  it('names every listed weekday of a weekly Recurrence', () => {
    // 2026-03-02 is a Monday.
    expect(
      expand({ kind: 'weekly', weekdays: [5, 3] }, '2026-03-02', '2026-03-15'),
    ).toEqual(['2026-03-04', '2026-03-06', '2026-03-11', '2026-03-13']);
  });

  it('counts nth weekdays on the calendar month across a month boundary', () => {
    expect(
      expand(
        {
          kind: 'monthly',
          entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
        },
        '2026-03-15',
        '2026-05-31',
      ),
    ).toEqual(['2026-04-05', '2026-05-03']);
  });

  it('gives a Cycle starting mid-month the 1st Sunday only if it contains it', () => {
    const firstSunday: Recurrence = {
      kind: 'monthly',
      entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
    };
    // March 2026: 1st Sunday is the 1st; 3rd Sunday the 15th.
    expect(expand(firstSunday, '2026-03-08', '2026-03-31')).toEqual([]);
    expect(expand(firstSunday, '2026-02-23', '2026-03-08')).toEqual([
      '2026-03-01',
    ]);
  });

  it('generates nothing for a 5th weekday the month lacks', () => {
    const fifthSunday: Recurrence = {
      kind: 'monthly',
      entries: [{ kind: 'nthWeekday', ordinal: 5, weekday: 0 }],
    };
    // March 2026 has five Sundays (29th); April 2026 has four.
    expect(expand(fifthSunday, '2026-03-01', '2026-04-30')).toEqual([
      '2026-03-29',
    ]);
  });

  it('names the last weekday of each month', () => {
    expect(
      expand(
        {
          kind: 'monthly',
          entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 6 }],
        },
        '2026-04-01',
        '2026-05-31',
      ),
    ).toEqual(['2026-04-25', '2026-05-30']);
  });

  it('generates nothing for a day of month the month lacks', () => {
    expect(
      expand(
        { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 31 }] },
        '2026-03-01',
        '2026-05-31',
      ),
    ).toEqual(['2026-03-31', '2026-05-31']);
  });

  it('names the last day of each month, leap February included', () => {
    expect(
      expand(
        { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
        '2028-01-15',
        '2028-04-29',
      ),
    ).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('generates a day named by several entries once, mixing kinds', () => {
    // 2026-03-29 is the 5th and last Sunday; 2026-03-31 is the 31st and last day.
    expect(
      expand(
        {
          kind: 'monthly',
          entries: [
            { kind: 'nthWeekday', ordinal: 5, weekday: 0 },
            { kind: 'nthWeekday', ordinal: 'last', weekday: 0 },
            { kind: 'dayOfMonth', day: 31 },
            { kind: 'lastDayOfMonth' },
            { kind: 'dayOfMonth', day: 15 },
          ],
        },
        '2026-03-01',
        '2026-03-31',
      ),
    ).toEqual(['2026-03-15', '2026-03-29', '2026-03-31']);
  });

  it('reads the CalendarDay, so a year boundary splits months correctly', () => {
    expect(
      expand(
        {
          kind: 'monthly',
          entries: [
            { kind: 'lastDayOfMonth' },
            { kind: 'nthWeekday', ordinal: 1, weekday: 5 },
          ],
        },
        '2026-12-30',
        '2027-01-02',
      ),
    ).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('is empty for a reversed range', () => {
    expect(
      expand({ kind: 'weekly', weekdays: [0] }, '2026-03-08', '2026-03-01'),
    ).toEqual([]);
  });
});

describe('assertRecurrence', () => {
  it.each<[string, unknown]>([
    ['weekly without weekdays', { kind: 'weekly', weekdays: [] }],
    ['weekday out of range', { kind: 'weekly', weekdays: [7] }],
    ['fractional weekday', { kind: 'weekly', weekdays: [1.5] }],
    ['monthly without entries', { kind: 'monthly', entries: [] }],
    [
      'ordinal out of range',
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 6, weekday: 0 }],
      },
    ],
    [
      'nth weekday out of range',
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: -1 }],
      },
    ],
    ['day 0', { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 0 }] }],
    ['day 32', { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 32 }] }],
    ['unknown kind', { kind: 'yearly' }],
  ])('rejects %s', (_name, recurrence) => {
    expect(() =>
      assertRecurrence({ recurrence: recurrence as Recurrence }),
    ).toThrow(InvalidRecurrenceError);
  });

  it('accepts weekly and mixed monthly Recurrences', () => {
    expect(() =>
      assertRecurrence({ recurrence: { kind: 'weekly', weekdays: [0, 3] } }),
    ).not.toThrow();
    expect(() =>
      assertRecurrence({
        recurrence: {
          kind: 'monthly',
          entries: [
            { kind: 'nthWeekday', ordinal: 'last', weekday: 6 },
            { kind: 'dayOfMonth', day: 31 },
            { kind: 'lastDayOfMonth' },
          ],
        },
      }),
    ).not.toThrow();
  });
});

describe('Recurrence on the Church Timezone calendar', () => {
  // 2026-11-01T01:30Z is still Saturday 31 October, 22:30, in São Paulo.
  const lateSaturday = parseInstant({ value: '2026-11-01T01:30:00.000Z' });
  const firstSunday: Recurrence = {
    kind: 'monthly',
    entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
  };
  const lastDay: Recurrence = {
    kind: 'monthly',
    entries: [{ kind: 'lastDayOfMonth' }],
  };

  it('names the Church-local day of an instant past UTC midnight, not the UTC one', () => {
    const churchDay = today({
      instant: lateSaturday,
      timeZone: 'America/Sao_Paulo',
    });

    expect(churchDay).toBe('2026-10-31');
    expect(recurrenceNamesDay({ recurrence: lastDay, day: churchDay })).toBe(
      true,
    );
    expect(
      recurrenceNamesDay({ recurrence: firstSunday, day: churchDay }),
    ).toBe(false);
  });
});
