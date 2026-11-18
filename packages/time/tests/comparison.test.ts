import { describe, expect, it } from 'vitest';
import {
  compareCalendarDays,
  compareInstants,
  parseCalendarDay,
  parseInstant,
} from '../src';

describe('compareInstants', () => {
  const earlier = parseInstant({ value: '2027-01-04T09:59:59.999Z' });
  const later = parseInstant({ value: '2027-01-04T10:00:00Z' });

  it('orders Instants on the timeline', () => {
    expect(compareInstants({ left: earlier, right: later })).toBe(-1);
    expect(compareInstants({ left: later, right: earlier })).toBe(1);
    expect(compareInstants({ left: later, right: later })).toBe(0);
  });

  it('works as a sort comparator', () => {
    expect(
      [later, earlier].sort((left, right) => compareInstants({ left, right })),
    ).toEqual([earlier, later]);
  });
});

describe('compareCalendarDays', () => {
  const dec31 = parseCalendarDay({ value: '2026-12-31' });
  const jan1 = parseCalendarDay({ value: '2027-01-01' });

  it('orders CalendarDays across a year boundary', () => {
    expect(compareCalendarDays({ left: dec31, right: jan1 })).toBe(-1);
    expect(compareCalendarDays({ left: jan1, right: dec31 })).toBe(1);
    expect(compareCalendarDays({ left: jan1, right: jan1 })).toBe(0);
  });
});
