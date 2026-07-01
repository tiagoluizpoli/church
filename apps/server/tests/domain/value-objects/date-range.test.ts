import { describe, expect, it } from 'vitest';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';
import { DateRange } from '../../../src/domain/value-objects/date-range';

describe('DateRange', () => {
  const start = new Date('2026-07-01T10:00:00Z');
  const end = new Date('2026-07-01T12:00:00Z');

  it('rejects reversed and zero-length ranges', () => {
    expect(() => DateRange.create(start, start)).toThrow(InvalidDateRangeError);
    expect(() => DateRange.create(end, start)).toThrow(InvalidDateRangeError);
  });

  it('contains both boundaries and excludes dates outside them', () => {
    const range = DateRange.create(start, end);

    expect(range.contains(start)).toBe(true);
    expect(range.contains(end)).toBe(true);
    expect(range.contains(new Date('2026-07-01T09:59:59Z'))).toBe(false);
    expect(range.contains(new Date('2026-07-01T12:00:01Z'))).toBe(false);
  });

  it('detects overlaps but not adjacent or disjoint ranges', () => {
    const range = DateRange.create(start, end);

    expect(
      range.overlaps(
        DateRange.create(
          new Date('2026-07-01T11:00:00Z'),
          new Date('2026-07-01T13:00:00Z'),
        ),
      ),
    ).toBe(true);
    expect(
      range.overlaps(DateRange.create(end, new Date('2026-07-01T13:00:00Z'))),
    ).toBe(false);
    expect(
      range.overlaps(
        DateRange.create(
          new Date('2026-07-01T08:00:00Z'),
          new Date('2026-07-01T09:00:00Z'),
        ),
      ),
    ).toBe(false);
  });
});
