import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { eventSpanLabel } from './event-span-label';

const label = ({ start, end }: { start: string; end: string }) =>
  eventSpanLabel({
    start: parseInstant({ value: start }),
    end: parseInstant({ value: end }),
  });

describe('eventSpanLabel', () => {
  it('labels a one-day event hourly', () => {
    expect(
      label({ start: '2027-01-01T09:00:00Z', end: '2027-01-01T17:00:00Z' }),
    ).toBe('hourly');
  });

  it('labels a multi-day event day_based', () => {
    expect(
      label({ start: '2027-01-01T09:00:00Z', end: '2027-01-03T17:00:00Z' }),
    ).toBe('day_based');
  });

  it('labels an event spanning midnight day_based', () => {
    expect(
      label({ start: '2027-01-01T22:00:00Z', end: '2027-01-02T06:00:00Z' }),
    ).toBe('day_based');
  });

  it('labels an event that fits one TimeSlot by its own span', () => {
    expect(
      label({ start: '2027-01-01T09:00:00Z', end: '2027-01-01T09:30:00Z' }),
    ).toBe('hourly');
  });
});
