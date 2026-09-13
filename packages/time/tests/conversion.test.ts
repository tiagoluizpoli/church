import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  addMilliseconds,
  addMinutes,
  type CalendarDay,
  enumerateCalendarDays,
  fromDate,
  millisecondsBetween,
  minutesBetween,
  parseInstant,
  type TimeOfDay,
  toDate,
  today,
  toInstant,
  toTimeOfDay,
  weekdayIndex,
} from '../src';

const day = (value: string) => value as CalendarDay;
const time = (value: string) => value as TimeOfDay;
const instant = (value: string) => parseInstant({ value });

describe('toInstant', () => {
  it('resolves church-local midnight, not UTC midnight', () => {
    expect(
      toInstant({
        day: day('2027-01-04'),
        time: time('00:00'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('2027-01-04T03:00:00.000Z');
  });

  it('handles a fractional offset', () => {
    expect(
      toInstant({
        day: day('2027-01-04'),
        time: time('00:00'),
        timeZone: 'Asia/Kolkata',
      }),
    ).toBe('2027-01-03T18:30:00.000Z');
  });

  it('follows a DST transition (America/New_York, 2027-03-14)', () => {
    const noon = (value: string) =>
      toInstant({
        day: day(value),
        time: time('12:00'),
        timeZone: 'America/New_York',
      });
    expect(noon('2027-03-13')).toBe('2027-03-13T17:00:00.000Z');
    expect(noon('2027-03-15')).toBe('2027-03-15T16:00:00.000Z');
  });
});

describe('today / toTimeOfDay', () => {
  const lateEvening = instant('2027-01-05T02:00:00.000Z');

  it('reads the CalendarDay through the Church Timezone', () => {
    expect(today({ instant: lateEvening, timeZone: 'America/Sao_Paulo' })).toBe(
      '2027-01-04',
    );
    expect(today({ instant: lateEvening, timeZone: 'UTC' })).toBe('2027-01-05');
  });

  it('reads the TimeOfDay through the Church Timezone', () => {
    expect(
      toTimeOfDay({ instant: lateEvening, timeZone: 'America/Sao_Paulo' }),
    ).toBe('23:00');
  });

  it('reads the day after a DST transition correctly', () => {
    expect(
      today({
        instant: instant('2027-11-07T04:30:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('2027-11-07');
  });
});

describe('persistence bridge', () => {
  it('round-trips an Instant through Date', () => {
    const value = instant('2027-01-04T13:30:05.123Z');
    const date = toDate({ instant: value });
    expect(date.getTime()).toBe(Date.parse('2027-01-04T13:30:05.123Z'));
    expect(fromDate({ date })).toBe(value);
  });
});

describe('arithmetic', () => {
  it('adds minutes to an Instant', () => {
    expect(
      addMinutes({ instant: instant('2027-01-04T23:30:00Z'), minutes: 45 }),
    ).toBe('2027-01-05T00:15:00.000Z');
  });

  it('measures minutes between Instants', () => {
    expect(
      minutesBetween({
        start: instant('2027-01-04T22:00:00Z'),
        end: instant('2027-01-05T02:00:00Z'),
      }),
    ).toBe(240);
  });

  it('adds and measures milliseconds', () => {
    const start = instant('2027-01-04T10:00:00.000Z');
    const later = addMilliseconds({ instant: start, milliseconds: 1_234 });
    expect(later).toBe('2027-01-04T10:00:01.234Z');
    expect(millisecondsBetween({ start, end: later })).toBe(1_234);
    expect(millisecondsBetween({ start: later, end: start })).toBe(-1_234);
  });

  it('adds CalendarDays across month and leap boundaries', () => {
    expect(addCalendarDays({ day: day('2028-02-28'), days: 1 })).toBe(
      '2028-02-29',
    );
    expect(addCalendarDays({ day: day('2027-01-01'), days: -1 })).toBe(
      '2026-12-31',
    );
  });

  it('enumerates CalendarDays inclusively', () => {
    expect(
      enumerateCalendarDays({
        start: day('2027-02-27'),
        end: day('2027-03-01'),
      }),
    ).toEqual(['2027-02-27', '2027-02-28', '2027-03-01']);
    expect(
      enumerateCalendarDays({
        start: day('2027-03-02'),
        end: day('2027-03-01'),
      }),
    ).toEqual([]);
  });

  it('names the weekday index of a CalendarDay (0 = Sunday)', () => {
    expect(weekdayIndex({ day: day('2027-01-03') })).toBe(0);
    expect(weekdayIndex({ day: day('2027-01-04') })).toBe(1);
  });
});
