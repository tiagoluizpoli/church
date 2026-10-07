import { parseCalendarDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import { historicalCycleWindow } from '../../seeds/development/history-window';

describe('historicalCycleWindow', () => {
  it.each([
    {
      label: 'mid-month',
      anchor: '2026-03-15',
      startDate: '2026-02-01',
      endDate: '2026-03-01',
    },
    {
      label: 'the first day of a month',
      anchor: '2026-03-01',
      startDate: '2026-02-01',
      endDate: '2026-03-01',
    },
    {
      label: 'the last day of a month',
      anchor: '2026-03-31',
      startDate: '2026-02-01',
      endDate: '2026-03-01',
    },
    {
      label: 'January, across the year',
      anchor: '2027-01-10',
      startDate: '2026-12-01',
      endDate: '2027-01-01',
    },
  ])('is the previous complete calendar month for an anchor on $label', ({
    anchor,
    startDate,
    endDate,
  }) => {
    expect(
      historicalCycleWindow({ anchor: parseCalendarDay({ value: anchor }) }),
    ).toEqual({ startDate, endDate });
  });
});
