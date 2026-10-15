import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { EVENT_STATUS_OPTIONS, Event } from '@/domain/entities/event';
import { InvalidDateRangeError } from '@/domain/errors/invalid-date-range';

const props = {
  churchId: 'c1',
  cycleId: 'pc1',
  sourceTemplateId: 'et1',
  title: 'Sunday Service',
  description: 'Weekly gathering',
  location: 'Main Hall',
  start: parseInstant({ value: '2026-05-15T10:00:00Z' }),
  end: parseInstant({ value: '2026-05-15T12:00:00Z' }),
};

describe('Event Entity', () => {
  it('constructs as church-owned cycle event', () => {
    const event = new Event(props);

    expect(event.churchId).toBe('c1');
    expect(event.cycleId).toBe('pc1');
    expect(event.sourceTemplateId).toBe('et1');
    expect(event.title).toBe('Sunday Service');
    expect(event.description).toBe('Weekly gathering');
    expect(event.location).toBe('Main Hall');
    expect('ministryId' in event).toBe(false);
    expect(event.status).toBe('draft');
  });

  it('supports only cycle event statuses', () => {
    expect(EVENT_STATUS_OPTIONS).toEqual([
      'draft',
      'scheduled',
      'cancelled',
      'past',
    ]);
  });

  it('moves through cycle-driven states without event publishing', () => {
    const event = new Event(props);

    event.markScheduled();
    expect(event.status).toBe('scheduled');
    event.cancel();
    expect(event.status).toBe('cancelled');
    event.markAsPast();
    expect(event.status).toBe('past');
    expect('publish' in event).toBe(false);
  });

  it('rejects an invalid date range', () => {
    expect(() => new Event({ ...props, start: props.end })).toThrow(
      InvalidDateRangeError,
    );
  });
});
