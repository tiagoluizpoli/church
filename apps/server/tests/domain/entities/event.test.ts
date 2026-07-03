import { describe, expect, it } from 'vitest';
import {
  EVENT_STATUS_OPTIONS,
  Event,
} from '../../../src/domain/entities/event';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';

const props = {
  churchId: 'c1',
  planningCycleId: 'pc1',
  sourceTemplateId: 'et1',
  title: 'Sunday Service',
  startDate: new Date('2026-05-15T10:00:00Z'),
  endDate: new Date('2026-05-15T12:00:00Z'),
};

describe('Event Entity', () => {
  it('constructs as church-owned cycle event', () => {
    const event = new Event(props);

    expect(event.churchId).toBe('c1');
    expect(event.planningCycleId).toBe('pc1');
    expect(event.sourceTemplateId).toBe('et1');
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
    expect(() => new Event({ ...props, startDate: props.endDate })).toThrow(
      InvalidDateRangeError,
    );
  });
});
