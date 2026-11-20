import { parseCalendarDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import { suggestNextCycle } from '@/application/db-cycle-manager';

const day = (value: string) => parseCalendarDay({ value });

describe('suggestNextCycle', () => {
  it('starts the day after the latest Cycle and runs to its month end, due next month', () => {
    expect(
      suggestNextCycle({
        latestEnd: day('2026-11-30'),
        churchToday: day('2026-11-19'),
      }),
    ).toEqual({
      startDate: day('2026-12-01'),
      endDate: day('2026-12-31'),
      isDue: true,
    });
  });

  it('starts this month when nothing is planned or the latest Cycle is long gone', () => {
    for (const latestEnd of [null, day('2025-03-31')]) {
      expect(
        suggestNextCycle({ latestEnd, churchToday: day('2026-11-19') }),
      ).toEqual({
        startDate: day('2026-11-01'),
        endDate: day('2026-11-30'),
        isDue: true,
      });
    }
  });

  it('is not due once the coming month is already planned', () => {
    expect(
      suggestNextCycle({
        latestEnd: day('2026-12-31'),
        churchToday: day('2026-11-19'),
      }),
    ).toEqual({
      startDate: day('2027-01-01'),
      endDate: day('2027-01-31'),
      isDue: false,
    });
  });

  it('continues mid-month to the month end after a Cycle that ends mid-month', () => {
    expect(
      suggestNextCycle({
        latestEnd: day('2026-11-15'),
        churchToday: day('2026-11-10'),
      }),
    ).toEqual({
      startDate: day('2026-11-16'),
      endDate: day('2026-11-30'),
      isDue: true,
    });
  });
});
