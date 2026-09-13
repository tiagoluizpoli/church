import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  addMilliseconds,
  addMinutes,
  calendarDaysBetween,
  enumerateCalendarDays,
  millisecondsBetween,
  minutesBetween,
  parseCalendarDay,
  parseInstant,
  weekdayIndex,
} from '../src';

describe('Instant arithmetic', () => {
  it('adds minutes to an Instant', () => {
    expect(
      addMinutes({
        instant: parseInstant({ value: '2027-01-04T23:30:00Z' }),
        minutes: 45,
      }),
    ).toBe('2027-01-05T00:15:00.000Z');
  });

  it('measures minutes between Instants', () => {
    expect(
      minutesBetween({
        start: parseInstant({ value: '2027-01-04T22:00:00Z' }),
        end: parseInstant({ value: '2027-01-05T02:00:00Z' }),
      }),
    ).toBe(240);
  });

  it('truncates partial minutes toward zero, symmetrically', () => {
    const start = parseInstant({ value: '2027-01-04T10:00:00Z' });
    const ninetySecondsLater = parseInstant({ value: '2027-01-04T10:01:30Z' });
    const ninetySecondsEarlier = parseInstant({
      value: '2027-01-04T09:58:30Z',
    });
    const thirtySecondsEarlier = parseInstant({
      value: '2027-01-04T09:59:30Z',
    });

    expect(minutesBetween({ start, end: ninetySecondsLater })).toBe(1);
    expect(minutesBetween({ start, end: ninetySecondsEarlier })).toBe(-1);
    expect(minutesBetween({ start, end: thirtySecondsEarlier })).toBe(0);
  });

  it('adds and measures milliseconds', () => {
    const start = parseInstant({ value: '2027-01-04T10:00:00.000Z' });
    const later = addMilliseconds({ instant: start, milliseconds: 1_234 });
    expect(later).toBe('2027-01-04T10:00:01.234Z');
    expect(millisecondsBetween({ start, end: later })).toBe(1_234);
    expect(millisecondsBetween({ start: later, end: start })).toBe(-1_234);
  });
});

describe('CalendarDay arithmetic', () => {
  it('adds CalendarDays across month and leap boundaries', () => {
    expect(
      addCalendarDays({
        day: parseCalendarDay({ value: '2028-02-28' }),
        days: 1,
      }),
    ).toBe('2028-02-29');
    expect(
      addCalendarDays({
        day: parseCalendarDay({ value: '2027-01-01' }),
        days: -1,
      }),
    ).toBe('2026-12-31');
  });

  it('enumerates CalendarDays inclusively', () => {
    expect(
      enumerateCalendarDays({
        start: parseCalendarDay({ value: '2027-02-27' }),
        end: parseCalendarDay({ value: '2027-03-01' }),
      }),
    ).toEqual(['2027-02-27', '2027-02-28', '2027-03-01']);
    expect(
      enumerateCalendarDays({
        start: parseCalendarDay({ value: '2027-03-02' }),
        end: parseCalendarDay({ value: '2027-03-01' }),
      }),
    ).toEqual([]);
  });

  it('names the weekday index of a CalendarDay (0 = Sunday)', () => {
    expect(
      weekdayIndex({ day: parseCalendarDay({ value: '2027-01-03' }) }),
    ).toBe(0);
    expect(
      weekdayIndex({ day: parseCalendarDay({ value: '2027-01-04' }) }),
    ).toBe(1);
  });

  it('counts whole CalendarDays, signed', () => {
    const jan4 = parseCalendarDay({ value: '2027-01-04' });
    const feb8 = parseCalendarDay({ value: '2027-02-08' });
    expect(calendarDaysBetween({ start: jan4, end: jan4 })).toBe(0);
    expect(calendarDaysBetween({ start: jan4, end: feb8 })).toBe(35);
    expect(calendarDaysBetween({ start: feb8, end: jan4 })).toBe(-35);
  });

  it('is unaffected by DST and leap days', () => {
    expect(
      calendarDaysBetween({
        start: parseCalendarDay({ value: '2028-02-28' }),
        end: parseCalendarDay({ value: '2028-03-01' }),
      }),
    ).toBe(2);
    expect(
      calendarDaysBetween({
        start: parseCalendarDay({ value: '2027-03-13' }),
        end: parseCalendarDay({ value: '2027-03-15' }),
      }),
    ).toBe(2);
  });
});
