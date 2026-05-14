import { describe, expect, it } from 'vitest';
import { Availability } from '../../../src/domain/entities/availability';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';

describe('Availability Entity', () => {
  it('constructs with valid props and defaults', () => {
    const startTime = new Date('2026-05-15T10:00:00Z');
    const endTime = new Date('2026-05-15T12:00:00Z');

    const availability = new Availability({
      churchId: 'c1',
      volunteerId: 'v1',
      startTime,
      endTime,
    });

    expect(availability.churchId).toBe('c1');
    expect(availability.volunteerId).toBe('v1');
    expect(availability.type).toBe('unavailable');
    expect(availability.startTime).toBe(startTime);
    expect(availability.endTime).toBe(endTime);
    expect(availability.isAllDay).toBe(false);
  });

  it('throws InvalidDateRangeError if startTime >= endTime', () => {
    const startTime = new Date('2026-05-15T12:00:00Z');
    const endTime = new Date('2026-05-15T10:00:00Z');

    expect(() => {
      new Availability({
        churchId: 'c1',
        volunteerId: 'v1',
        startTime,
        endTime,
      });
    }).toThrow(InvalidDateRangeError);
  });
});
