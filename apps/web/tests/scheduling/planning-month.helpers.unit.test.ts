import { describe, expect, it } from 'vitest';
import { nonSundayDay, planningMonth } from './planning-month.helpers';

describe('planningMonth', () => {
  it('spans the calendar month after the anchor', () => {
    expect(planningMonth({ anchor: '2026-03-15' })).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-05-01',
    });
  });

  it('rolls over the year boundary', () => {
    expect(planningMonth({ anchor: '2026-12-28' })).toEqual({
      startDate: '2027-01-01',
      endDate: '2027-02-01',
    });
  });

  it('starts after a month-end anchor', () => {
    expect(planningMonth({ anchor: '2026-01-31' })).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-03-01',
    });
  });
});

describe('nonSundayDay', () => {
  it('keeps a weekday', () => {
    expect(nonSundayDay({ day: '2026-04-15' })).toBe('2026-04-15');
  });

  it('moves a Sunday to the Monday after', () => {
    expect(nonSundayDay({ day: '2026-03-15' })).toBe('2026-03-16');
  });
});
