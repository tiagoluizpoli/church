import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type CalendarDay,
  type Instant,
  InvalidTimeValueError,
  isCalendarDay,
  isInstant,
  isTimeOfDay,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  type TimeOfDay,
  type ToDateInput,
} from '../src';

describe('brands', () => {
  it('are nominally distinct, so one kind never passes for another', () => {
    expectTypeOf<CalendarDay>().not.toExtend<Instant>();
    expectTypeOf<Instant>().not.toExtend<CalendarDay>();
    expectTypeOf<TimeOfDay>().not.toExtend<Instant>();
    expectTypeOf<TimeOfDay>().not.toExtend<CalendarDay>();
    expectTypeOf<string>().not.toExtend<Instant>();

    const day = parseCalendarDay({ value: '2027-01-04' });
    expectTypeOf({ instant: day }).not.toExtend<ToDateInput>();
  });
});

describe('parseInstant', () => {
  it('accepts canonical UTC, with or without milliseconds', () => {
    expect(parseInstant({ value: '2027-01-04T13:30:00.000Z' })).toBe(
      '2027-01-04T13:30:00.000Z',
    );
    expect(parseInstant({ value: '2027-01-04T13:30:05Z' })).toBe(
      '2027-01-04T13:30:05.000Z',
    );
  });

  it.each([
    '2027-01-04T10:30:00-03:00',
    '2027-01-04T13:30:00+00:00',
    '2027-01-04T13:30Z',
    '2027-01-04T13:30:00.1Z',
    '2027-01-04T13:30:00.123456Z',
    '2027-01-04 13:30:00Z',
    '2027-01-04T10:30:00',
    '2027-01-04',
    '2027-02-30T10:00:00Z',
    '2027-01-04T24:00:00Z',
    'not a time',
  ])('rejects %s', (value) => {
    expect(() => parseInstant({ value })).toThrow(InvalidTimeValueError);
    expect(isInstant({ value })).toBe(false);
  });
});

describe('parseCalendarDay', () => {
  it('accepts a real yyyy-MM-dd day', () => {
    expect(parseCalendarDay({ value: '2027-01-04' })).toBe('2027-01-04');
    expect(isCalendarDay({ value: '2028-02-29' })).toBe(true);
  });

  it.each([
    '2027-02-30',
    '2027-02-29',
    '04/01/2027',
    '2027-1-4',
    '',
  ])('rejects %s', (value) => {
    expect(() => parseCalendarDay({ value })).toThrow(InvalidTimeValueError);
    expect(isCalendarDay({ value })).toBe(false);
  });
});

describe('parseTimeOfDay', () => {
  it('accepts HH:mm', () => {
    expect(parseTimeOfDay({ value: '09:05' })).toBe('09:05');
    expect(parseTimeOfDay({ value: '23:59' })).toBe('23:59');
  });

  it.each([
    '24:00',
    '9:05',
    '12:60',
    '23:59:00',
    '10:30:15',
    '10:30 AM',
  ])('rejects %s', (value) => {
    expect(() => parseTimeOfDay({ value })).toThrow(InvalidTimeValueError);
    expect(isTimeOfDay({ value })).toBe(false);
  });
});
