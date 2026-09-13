import { describe, expect, it } from 'vitest';
import {
  fromDate,
  fromTimeColumn,
  type Instant,
  InvalidTimeValueError,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  toDate,
  today,
  toInstant,
  toTimeOfDay,
} from '../src';

interface NewYorkWallClockInput {
  day: string;
  time: string;
}

/** The Instant a New York wall clock names — the DST-observing fixture zone. */
function newYorkInstant({ day, time }: NewYorkWallClockInput): Instant {
  return toInstant({
    day: parseCalendarDay({ value: day }),
    time: parseTimeOfDay({ value: time }),
    timeZone: 'America/New_York',
  });
}

describe('toInstant', () => {
  it('resolves church-local midnight, not UTC midnight', () => {
    expect(
      toInstant({
        day: parseCalendarDay({ value: '2027-01-04' }),
        time: parseTimeOfDay({ value: '00:00' }),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('2027-01-04T03:00:00.000Z');
  });

  it('handles a fractional offset', () => {
    expect(
      toInstant({
        day: parseCalendarDay({ value: '2027-01-04' }),
        time: parseTimeOfDay({ value: '00:00' }),
        timeZone: 'Asia/Kolkata',
      }),
    ).toBe('2027-01-03T18:30:00.000Z');
  });

  it('follows a DST transition (America/New_York, 2027-03-14)', () => {
    expect(newYorkInstant({ day: '2027-03-13', time: '12:00' })).toBe(
      '2027-03-13T17:00:00.000Z',
    );
    expect(newYorkInstant({ day: '2027-03-15', time: '12:00' })).toBe(
      '2027-03-15T16:00:00.000Z',
    );
  });

  it('shifts a wall clock skipped by spring-forward later by the gap', () => {
    // 02:00–02:59 never happens on 2027-03-14 in New York: 02:30 → 03:30 EDT.
    expect(newYorkInstant({ day: '2027-03-14', time: '02:30' })).toBe(
      '2027-03-14T07:30:00.000Z',
    );
    expect(newYorkInstant({ day: '2027-03-14', time: '03:00' })).toBe(
      '2027-03-14T07:00:00.000Z',
    );
  });

  it('picks the earlier Instant for a wall clock repeated by fall-back', () => {
    // 01:00–01:59 happens twice on 2027-11-07 in New York: EDT wins.
    expect(newYorkInstant({ day: '2027-11-07', time: '01:30' })).toBe(
      '2027-11-07T05:30:00.000Z',
    );
    expect(newYorkInstant({ day: '2027-11-07', time: '02:00' })).toBe(
      '2027-11-07T07:00:00.000Z',
    );
  });
});

describe('today / toTimeOfDay', () => {
  const lateEvening = parseInstant({ value: '2027-01-05T02:00:00.000Z' });

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
        instant: parseInstant({ value: '2027-11-07T04:30:00.000Z' }),
        timeZone: 'America/New_York',
      }),
    ).toBe('2027-11-07');
  });
});

describe('persistence bridge', () => {
  it('round-trips an Instant through Date', () => {
    const value = parseInstant({ value: '2027-01-04T13:30:05.123Z' });
    const date = toDate({ instant: value });
    expect(date.getTime()).toBe(Date.parse('2027-01-04T13:30:05.123Z'));
    expect(fromDate({ date })).toBe(value);
  });

  it('rejects an invalid Date', () => {
    expect(() => fromDate({ date: new Date('nope') })).toThrow(
      InvalidTimeValueError,
    );
  });

  it('reads a database time column into a TimeOfDay', () => {
    expect(fromTimeColumn({ value: '09:05:00' })).toBe('09:05');
  });

  it.each([
    '09:05',
    '09:05:30',
    '24:00:00',
    '9:05:00',
  ])('rejects time column value %s', (value) => {
    expect(() => fromTimeColumn({ value })).toThrow(InvalidTimeValueError);
  });
});
