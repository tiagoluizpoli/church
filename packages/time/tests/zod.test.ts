import { describe, expect, it } from 'vitest';
import { calendarDaySchema, instantSchema, timeOfDaySchema } from '../src/zod';

describe('instantSchema', () => {
  it('accepts a canonical Instant string', () => {
    expect(instantSchema.parse('2027-01-04T13:30:00.000Z')).toBe(
      '2027-01-04T13:30:00.000Z',
    );
  });

  it('rejects a non-UTC offset', () => {
    expect(() => instantSchema.parse('2027-01-04T13:30:00+02:00')).toThrow();
  });
});

describe('calendarDaySchema', () => {
  it('accepts a yyyy-MM-dd string', () => {
    expect(calendarDaySchema.parse('2027-01-04')).toBe('2027-01-04');
  });

  it('rejects a full timestamp', () => {
    expect(() => calendarDaySchema.parse('2027-01-04T13:30:00.000Z')).toThrow();
  });
});

describe('timeOfDaySchema', () => {
  it('accepts HH:mm', () => {
    expect(timeOfDaySchema.parse('13:30')).toBe('13:30');
  });

  it('rejects a value missing the minute segment', () => {
    expect(() => timeOfDaySchema.parse('13')).toThrow();
  });
});
