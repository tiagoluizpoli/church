import { describe, expect, it } from 'vitest';
import { Event } from '../../../src/domain/entities/event';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';

describe('Event Entity', () => {
  it('constructs with valid props and defaults', () => {
    const startDate = new Date('2026-05-15T10:00:00Z');
    const endDate = new Date('2026-05-15T12:00:00Z');

    const event = new Event({
      churchId: 'c1',
      ministryId: 'm1',
      title: 'Sunday Service',
      startDate,
      endDate,
    });

    expect(event.churchId).toBe('c1');
    expect(event.ministryId).toBe('m1');
    expect(event.title).toBe('Sunday Service');
    expect(event.startDate).toBe(startDate);
    expect(event.endDate).toBe(endDate);
    expect(event.status).toBe('draft');
  });

  it('throws InvalidDateRangeError if startDate >= endDate', () => {
    const startDate = new Date('2026-05-15T12:00:00Z');
    const endDate = new Date('2026-05-15T10:00:00Z');

    expect(() => {
      new Event({
        churchId: 'c1',
        ministryId: 'm1',
        title: 'Sunday Service',
        startDate,
        endDate,
      });
    }).toThrow(InvalidDateRangeError);
  });

  it('handles mutations correctly', () => {
    const startDate = new Date('2026-05-15T10:00:00Z');
    const endDate = new Date('2026-05-15T12:00:00Z');

    const event = new Event({
      churchId: 'c1',
      ministryId: 'm1',
      title: 'Sunday Service',
      startDate,
      endDate,
    });

    expect(event.status).toBe('draft');

    event.publish();
    expect(event.status).toBe('published');

    event.cancel();
    expect(event.status).toBe('cancelled');

    event.markAsPast();
    expect(event.status).toBe('past');
  });
});
