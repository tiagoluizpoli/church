import { describe, expect, it } from 'vitest';
import {
  buildMinistryCycleSummaries,
  filterCycleSummaries,
} from './cycle-list.utils';
import type { ListMinistryCycleSummaries200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';

function makeCycleSummary(
  overrides: Partial<ListMinistryCycleSummaries200CyclesItem> = {},
): ListMinistryCycleSummaries200CyclesItem {
  return {
    cycleId: 'cycle-1',
    name: 'Agosto 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    isPartOf: true,
    eventCount: 1,
    slotCount: 2,
    status: 'in_progress',
    availabilityFiredForAll: false,
    availabilityFiredForAny: false,
    ...overrides,
  };
}

describe('buildMinistryCycleSummaries (US2/Iteration 3 — real columns, sole data source)', () => {
  it("names each summary with the cycle's own name and window, and carries the aggregated Iteration 3 fields verbatim", () => {
    const summaries = buildMinistryCycleSummaries({
      cycles: [makeCycleSummary()],
    });

    expect(summaries).toEqual([
      {
        id: 'cycle-1',
        name: 'Agosto 2026',
        window: 'Aug 1, 2026 - Aug 31, 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        eventCount: 1,
        slotCount: 2,
        status: 'in_progress',
        isPartOf: true,
        availabilityFiredForAll: false,
        availabilityFiredForAny: false,
      },
    ]);
  });

  it('includes cycles the ministry is not part of, unlike the old events-derived join', () => {
    const summaries = buildMinistryCycleSummaries({
      cycles: [
        makeCycleSummary({
          cycleId: 'cycle-not-part-of',
          name: 'No Events',
          isPartOf: false,
          eventCount: 0,
          slotCount: 0,
          status: 'not_started',
          availabilityFiredForAll: false,
        }),
      ],
    });

    expect(summaries.map((summary) => summary.id)).toEqual([
      'cycle-not-part-of',
    ]);
    expect(summaries[0]?.isPartOf).toBe(false);
  });

  it('sorts by parsed start date, not alphabetically by the formatted label', () => {
    const summaries = buildMinistryCycleSummaries({
      cycles: [
        // A "Sep 1, 2027" label alphabetically precedes "Sep 2, 2026" as a
        // string, even though 2026 comes first chronologically — this is
        // the exact bug the fix replaces (research/critique P1).
        makeCycleSummary({
          cycleId: 'cycle-2027',
          name: 'Later Cycle',
          startDate: '2027-09-01',
          endDate: '2027-09-05',
        }),
        makeCycleSummary({
          cycleId: 'cycle-2026',
          name: 'Earlier Cycle',
          startDate: '2026-09-02',
          endDate: '2026-09-06',
        }),
      ],
    });

    expect(summaries.map((summary) => summary.id)).toEqual([
      'cycle-2026',
      'cycle-2027',
    ]);
  });
});

describe('filterCycleSummaries (FR-033 — date range/involvement/status, AND semantics)', () => {
  const summaries = buildMinistryCycleSummaries({
    cycles: [
      makeCycleSummary({
        cycleId: 'aug-not-part-of',
        name: 'August (not part of)',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        isPartOf: false,
        eventCount: 0,
        slotCount: 0,
        status: 'not_started',
      }),
      makeCycleSummary({
        cycleId: 'sep-in-progress',
        name: 'September (in progress)',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        isPartOf: true,
        status: 'in_progress',
      }),
      makeCycleSummary({
        cycleId: 'oct-published',
        name: 'October (published)',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        isPartOf: true,
        status: 'published',
      }),
    ],
  });

  it('returns every cycle when no filter is applied', () => {
    expect(
      filterCycleSummaries({ cycles: summaries, filter: {} }),
    ).toHaveLength(3);
  });

  it('narrows by date range, mode "ends" — cycles whose end date falls in the range', () => {
    const result = filterCycleSummaries({
      cycles: summaries,
      filter: {
        dateRange: { mode: 'ends', start: '2026-09-15', end: '2026-12-31' },
      },
    });

    expect(result.map((cycle) => cycle.id)).toEqual([
      'sep-in-progress',
      'oct-published',
    ]);
  });

  it('narrows by date range, mode "starts" — cycles whose start date falls in the range (design-critique follow-up, mirrors TimeWindowFilter)', () => {
    const result = filterCycleSummaries({
      cycles: summaries,
      filter: {
        dateRange: { mode: 'starts', start: '2026-09-15', end: '2026-12-31' },
      },
    });

    // September's own start date (09-01) falls before the range even
    // though its end date (09-30) doesn't — only October's start date
    // (10-01) is actually within [09-15, 12-31].
    expect(result.map((cycle) => cycle.id)).toEqual(['oct-published']);
  });

  it('narrows by date range, mode "within" — cycles entirely inside the range on both bounds', () => {
    const result = filterCycleSummaries({
      cycles: summaries,
      filter: {
        dateRange: { mode: 'within', start: '2026-09-01', end: '2026-09-30' },
      },
    });

    expect(result.map((cycle) => cycle.id)).toEqual(['sep-in-progress']);
  });

  it('applies no date filtering when both bounds are empty, regardless of mode', () => {
    const result = filterCycleSummaries({
      cycles: summaries,
      filter: { dateRange: { mode: 'starts' } },
    });

    expect(result).toHaveLength(3);
  });

  it('narrows by Ministry Involvement, including "Not part of"', () => {
    expect(
      filterCycleSummaries({
        cycles: summaries,
        filter: { involvement: 'part_of' },
      }).map((cycle) => cycle.id),
    ).toEqual(['sep-in-progress', 'oct-published']);

    expect(
      filterCycleSummaries({
        cycles: summaries,
        filter: { involvement: 'not_part_of' },
      }).map((cycle) => cycle.id),
    ).toEqual(['aug-not-part-of']);

    expect(
      filterCycleSummaries({
        cycles: summaries,
        filter: { involvement: 'all' },
      }),
    ).toHaveLength(3);
  });

  it('narrows by status', () => {
    expect(
      filterCycleSummaries({
        cycles: summaries,
        filter: { status: 'published' },
      }).map((cycle) => cycle.id),
    ).toEqual(['oct-published']);
  });

  it('combines multiple filters with AND semantics', () => {
    const result = filterCycleSummaries({
      cycles: summaries,
      filter: { involvement: 'part_of', status: 'published' },
    });

    expect(result.map((cycle) => cycle.id)).toEqual(['oct-published']);
  });
});
