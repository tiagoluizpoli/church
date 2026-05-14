import { describe, expect, it } from 'vitest';
import { TimeSlot } from '../../../src/domain/entities/time-slot';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';

describe('TimeSlot Entity', () => {
  it('constructs with valid props', () => {
    const startTime = new Date('2026-05-15T10:00:00Z');
    const endTime = new Date('2026-05-15T12:00:00Z');

    const timeSlot = new TimeSlot({
      churchId: 'c1',
      eventId: 'e1',
      startTime,
      endTime,
      label: 'Morning Slot',
    });

    expect(timeSlot.churchId).toBe('c1');
    expect(timeSlot.eventId).toBe('e1');
    expect(timeSlot.label).toBe('Morning Slot');
    expect(timeSlot.startTime).toBe(startTime);
    expect(timeSlot.endTime).toBe(endTime);
  });

  it('throws InvalidDateRangeError if startTime >= endTime', () => {
    const startTime = new Date('2026-05-15T12:00:00Z');
    const endTime = new Date('2026-05-15T10:00:00Z');

    expect(() => {
      new TimeSlot({
        churchId: 'c1',
        eventId: 'e1',
        startTime,
        endTime,
      });
    }).toThrow(InvalidDateRangeError);
  });
});
