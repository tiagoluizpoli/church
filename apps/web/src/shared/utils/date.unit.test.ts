import { describe, expect, it } from 'vitest';
import { toCycleDayKey } from './date';

describe('toCycleDayKey', () => {
  it('keeps a UTC-midnight cycle bound on its intended day', () => {
    // `2027-01-01T00:00:00.000Z` names January 1 — it is not a moment in
    // church-local time, so it must not be read in the viewer's zone.
    expect(toCycleDayKey('2027-01-01T00:00:00.000Z')).toBe('2027-01-01');
    expect(toCycleDayKey('2027-01-31T00:00:00.000Z')).toBe('2027-01-31');
  });
});
