import { describe, expect, it } from 'vitest';
import {
  InvalidTimeValueError,
  isCalendarDay,
  isInstant,
  isTimeOfDay,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
} from '../src';

describe('parseInstant', () => {
  it('normalizes any explicit offset to canonical UTC', () => {
    expect(parseInstant({ value: '2027-01-04T10:30:00-03:00' })).toBe(
      '2027-01-04T13:30:00.000Z',
    );
    expect(parseInstant({ value: '2027-01-04T13:30Z' })).toBe(
      '2027-01-04T13:30:00.000Z',
    );
  });

  it.each([
    '2027-01-04T10:30:00',
    '2027-01-04',
    '2027-02-30T10:00:00Z',
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
  });
});

describe('parseTimeOfDay', () => {
  it('accepts HH:mm and drops zero seconds from database time columns', () => {
    expect(parseTimeOfDay({ value: '09:05' })).toBe('09:05');
    expect(parseTimeOfDay({ value: '23:59:00' })).toBe('23:59');
  });

  it.each([
    '24:00',
    '9:05',
    '12:60',
    '10:30:15',
    '10:30 AM',
  ])('rejects %s', (value) => {
    expect(() => parseTimeOfDay({ value })).toThrow(InvalidTimeValueError);
    expect(isTimeOfDay({ value })).toBe(false);
  });
});
