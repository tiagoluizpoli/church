import { describe, expect, it } from 'vitest';
import {
  type CalendarDay,
  formatCalendarDay,
  formatCalendarDayWithWeekday,
  formatDayAndMonth,
  formatInstant,
  formatInstantPrecise,
  formatRecency,
  formatRelative,
  formatTimeOfDay,
  formatWeekday,
  type Instant,
  instantSpan,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  setTestClock,
  type TimeOfDay,
  timeOfDaySpan,
} from '../src';

function day(value: string): CalendarDay {
  return parseCalendarDay({ value });
}

function instant(value: string): Instant {
  return parseInstant({ value });
}

function timeOfDay(value: string): TimeOfDay {
  return parseTimeOfDay({ value });
}

describe('formatCalendarDay', () => {
  it('renders dd/MM/yyyy', () => {
    expect(formatCalendarDay({ day: day('2027-01-04') })).toBe('04/01/2027');
  });
});

describe('formatCalendarDayWithWeekday', () => {
  it('prefixes the weekday name', () => {
    expect(formatCalendarDayWithWeekday({ day: day('2027-01-04') })).toBe(
      'Monday, 04/01/2027',
    );
  });
});

describe('formatWeekday', () => {
  it.each([
    ['2027-01-03', 'Sunday'],
    ['2027-01-04', 'Monday'],
    ['2027-01-09', 'Saturday'],
  ])('names the weekday for %s', (value, expected) => {
    expect(formatWeekday({ day: day(value) })).toBe(expected);
  });
});

describe('formatDayAndMonth', () => {
  it('renders dd/MM without the year', () => {
    expect(formatDayAndMonth({ day: day('2027-01-04') })).toBe('04/01');
  });
});

describe('formatTimeOfDay', () => {
  it('renders HH:mm with no AM/PM', () => {
    expect(formatTimeOfDay({ time: timeOfDay('14:30') })).toBe('14:30');
    expect(formatTimeOfDay({ time: timeOfDay('00:00') })).not.toMatch(/AM|PM/);
  });
});

describe('formatInstant', () => {
  it('reads the Church Timezone wall clock (non-UTC zone)', () => {
    expect(
      formatInstant({
        instant: instant('2027-01-04T13:30:00.000Z'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('04/01/2027 10:30');
  });

  it('reads the Church Timezone wall clock across a DST transition', () => {
    // 2027-03-14T07:00Z is the transition instant: EST (-5) before, EDT (-4) from.
    expect(
      formatInstant({
        instant: instant('2027-03-14T06:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 01:00');
    expect(
      formatInstant({
        instant: instant('2027-03-14T08:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 04:00');
  });

  it('never shows AM/PM', () => {
    expect(
      formatInstant({
        instant: instant('2027-01-04T13:30:00.000Z'),
        timeZone: 'UTC',
      }),
    ).not.toMatch(/AM|PM/);
  });
});

describe('formatInstantPrecise', () => {
  it('adds seconds', () => {
    expect(
      formatInstantPrecise({
        instant: instant('2027-01-04T13:30:05.123Z'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('04/01/2027 10:30:05');
  });

  it('shows seconds across a DST transition', () => {
    // 2027-03-14T07:00Z is the transition instant: EST (-5) before, EDT (-4) from.
    expect(
      formatInstantPrecise({
        instant: instant('2027-03-14T06:00:09.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 01:00:09');
    expect(
      formatInstantPrecise({
        instant: instant('2027-03-14T08:00:09.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 04:00:09');
  });

  it('never shows milliseconds', () => {
    expect(
      formatInstantPrecise({
        instant: instant('2027-01-04T13:30:05.999Z'),
        timeZone: 'UTC',
      }),
    ).not.toContain('.');
  });
});

describe('formatRelative', () => {
  it('names today, tomorrow and yesterday in the Church Timezone', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    expect(
      formatRelative({
        instant: instant('2027-01-04T20:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('today');
    expect(
      formatRelative({
        instant: instant('2027-01-05T20:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('tomorrow');
    expect(
      formatRelative({
        instant: instant('2027-01-03T20:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('yesterday');
  });

  it('counts days beyond the adjacent day', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    expect(
      formatRelative({
        instant: instant('2027-01-07T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('in 3 days');
    expect(
      formatRelative({
        instant: instant('2027-01-01T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('3 days ago');
  });

  it('resolves the CalendarDay through a non-UTC, DST-observing zone', () => {
    // now(): 2027-03-14T04:30Z is 2027-03-13 23:30 EST in New York.
    setTestClock({ instant: instant('2027-03-14T04:30:00.000Z') });
    // Target: 2027-03-14T17:00Z is 2027-03-14 13:00 EDT — one calendar day later.
    expect(
      formatRelative({
        instant: instant('2027-03-14T17:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('tomorrow');
  });
});

describe('formatRecency', () => {
  it('is relative under 7 days', () => {
    setTestClock({ instant: instant('2027-01-10T12:00:00.000Z') });
    expect(
      formatRecency({
        instant: instant('2027-01-04T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('6 days ago');
    expect(
      formatRecency({
        instant: instant('2027-01-16T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('in 6 days');
  });

  it('switches to the absolute CalendarDay at exactly 7 days, past and future', () => {
    setTestClock({ instant: instant('2027-01-10T12:00:00.000Z') });
    expect(
      formatRecency({
        instant: instant('2027-01-03T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('03/01/2027');
    expect(
      formatRecency({
        instant: instant('2027-01-17T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('17/01/2027');
  });

  it('resolves the CalendarDay distance through a non-UTC, DST-observing zone', () => {
    // now(): 2027-03-14T04:30Z is 2027-03-13 23:30 EST in New York.
    setTestClock({ instant: instant('2027-03-14T04:30:00.000Z') });
    // 2027-03-21T13:00Z is 2027-03-21 09:00 EDT — 8 CalendarDays later, past
    // the 7-day switch, so the absolute CalendarDay is shown.
    expect(
      formatRecency({
        instant: instant('2027-03-21T13:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('21/03/2027');
    // 2027-03-16T13:00Z is 2027-03-16 09:00 EDT — 3 CalendarDays later, still
    // under the switch, so it stays relative.
    expect(
      formatRecency({
        instant: instant('2027-03-16T13:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('in 3 days');
  });
});

describe('timeOfDaySpan', () => {
  it('covers a same-day span', () => {
    expect(
      timeOfDaySpan({ start: timeOfDay('09:00'), end: timeOfDay('10:30') }),
    ).toEqual({ durationMinutes: 90, crossesToNextDay: false });
  });

  it('covers a span crossing midnight', () => {
    expect(
      timeOfDaySpan({ start: timeOfDay('23:00'), end: timeOfDay('01:00') }),
    ).toEqual({ durationMinutes: 120, crossesToNextDay: true });
  });

  it('covers equal start and end', () => {
    expect(
      timeOfDaySpan({ start: timeOfDay('09:00'), end: timeOfDay('09:00') }),
    ).toEqual({ durationMinutes: 0, crossesToNextDay: false });
  });
});

describe('instantSpan', () => {
  it('covers a same-day span', () => {
    expect(
      instantSpan({
        start: instant('2027-01-04T13:00:00.000Z'),
        end: instant('2027-01-04T17:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toEqual({ durationMinutes: 240, crossesToNextDay: false });
  });

  it('covers a span crossing onto the next CalendarDay in the Church Timezone', () => {
    expect(
      instantSpan({
        start: instant('2027-01-04T23:00:00.000Z'),
        end: instant('2027-01-05T01:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toEqual({ durationMinutes: 120, crossesToNextDay: true });
  });

  it('covers equal start and end', () => {
    const at = instant('2027-01-04T13:00:00.000Z');
    expect(instantSpan({ start: at, end: at, timeZone: 'UTC' })).toEqual({
      durationMinutes: 0,
      crossesToNextDay: false,
    });
  });
});
