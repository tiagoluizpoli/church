import { parseInstant, parseTimeOfDay } from '@church/time';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildEventTimeBlockDayMarkers,
  buildMinistryPrepareSummary,
  createInitialSplitForms,
  filterEventTimeBlocksByName,
  filterEventTimeBlocksByTimeOfDay,
  formatTimeRange,
  isTimeWindowFilterEmpty,
  participationStateLabel,
  toCalendarDateString,
  toScheduleKey,
  validateManualSpans,
} from '@/features/scheduling/components/participation-prepare.utils';
import type { GetCycleParticipation200EventsItem } from '@/infrastructure/api/churchAPI.schemas';

const EVENT_TIME_BLOCK_VIEW: GetCycleParticipation200EventsItem['slots'][number] =
  {
    slot: {
      id: 'event-time-block-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-07-12T09:00:00Z',
      endTime: '2026-07-12T11:00:00Z',
      label: 'Greeter',
      status: 'active',
      requirements: [],
    },
    included: true,
    shifts: [],
    requirements: [],
  };

type EventTimeBlockViewOverride = {
  slot?: Partial<GetCycleParticipation200EventsItem['slots'][number]['slot']>;
  included?: boolean;
  shifts?: GetCycleParticipation200EventsItem['slots'][number]['shifts'];
  requirements?: GetCycleParticipation200EventsItem['slots'][number]['requirements'];
};

function makeEventView(
  overrides: Partial<GetCycleParticipation200EventsItem> & {
    eventTimeBlockOverrides?: EventTimeBlockViewOverride[];
  } = {},
): GetCycleParticipation200EventsItem {
  const { eventTimeBlockOverrides, ...eventOverrides } = overrides;

  return {
    participation: {
      id: 'participation-1',
      churchId: 'church-1',
      ministryId: 'ministry-1',
      eventId: 'event-1',
      state: 'preparing',
    },
    event: {
      id: 'event-1',
      churchId: 'church-1',
      cycleId: 'cycle-1',
      title: 'Sunday Service',
      start: '2026-07-12T09:00:00Z',
      end: '2026-07-12T11:00:00Z',
      status: 'scheduled',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    },
    slots: (
      eventTimeBlockOverrides ?? [
        {
          slot: {
            id: 'event-time-block-1',
            churchId: 'church-1',
            eventId: 'event-1',
            startTime: '2026-07-12T09:00:00Z',
            endTime: '2026-07-12T10:00:00Z',
            label: 'Greeter',
            status: 'active',
            requirements: [],
          },
          included: true,
          shifts: [],
          requirements: [],
        },
      ]
    ).map((eventTimeBlockOverride) => ({
      slot: {
        id: 'event-time-block-1',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: '2026-07-12T09:00:00Z',
        endTime: '2026-07-12T10:00:00Z',
        label: 'Greeter',
        status: 'active',
        requirements: [],
        ...eventTimeBlockOverride.slot,
      },
      included: eventTimeBlockOverride.included ?? true,
      shifts: eventTimeBlockOverride.shifts ?? [],
      requirements: eventTimeBlockOverride.requirements ?? [],
    })),
    ...eventOverrides,
  };
}

describe('toScheduleKey', () => {
  it('joins ministryId and cycleId with a colon', () => {
    expect(
      toScheduleKey({ ministryId: 'ministry-1', cycleId: 'cycle-1' }),
    ).toBe('ministry-1:cycle-1');
  });
});

describe('buildMinistryPrepareSummary (T006/R10)', () => {
  describe('Happy Path', () => {
    it('sums event/slot counts intersected with the sent-cycle set', () => {
      const rows = buildMinistryPrepareSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        sentCycleIds: ['cycle-1'],
        eventsByMinistryId: {
          'ministry-1': [{ cycleId: 'cycle-1' }, { cycleId: 'cycle-1' }],
        },
        eventTimeBlockCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 5,
        },
      });

      expect(rows).toEqual([
        {
          ministryId: 'ministry-1',
          ministryName: 'Greeters',
          eventCount: 2,
          eventTimeBlockCount: 5,
        },
      ]);
    });

    it('sums slot counts across 2+ concurrently sent cycles', () => {
      const rows = buildMinistryPrepareSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        sentCycleIds: ['cycle-1', 'cycle-2'],
        eventsByMinistryId: {
          'ministry-1': [{ cycleId: 'cycle-1' }, { cycleId: 'cycle-2' }],
        },
        eventTimeBlockCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 3,
          'ministry-1:cycle-2': 4,
        },
      });

      expect(rows[0]).toMatchObject({ eventCount: 2, eventTimeBlockCount: 7 });
    });
  });

  describe('Edge Cases', () => {
    it('returns 0/0 for an untouched ministry with no events', () => {
      const rows = buildMinistryPrepareSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        sentCycleIds: ['cycle-1'],
        eventsByMinistryId: {},
        eventTimeBlockCountByMinistryAndCycle: {},
      });

      expect(rows).toEqual([
        {
          ministryId: 'ministry-1',
          ministryName: 'Greeters',
          eventCount: 0,
          eventTimeBlockCount: 0,
        },
      ]);
    });

    it('excludes events whose cycle is not in the sent set (draft/past)', () => {
      const rows = buildMinistryPrepareSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        sentCycleIds: ['cycle-1'],
        eventsByMinistryId: {
          'ministry-1': [{ cycleId: 'cycle-1' }, { cycleId: 'cycle-draft' }],
        },
        eventTimeBlockCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 2,
          'ministry-1:cycle-draft': 99,
        },
      });

      expect(rows[0]).toMatchObject({ eventCount: 1, eventTimeBlockCount: 2 });
    });

    it('reflects non-zero pre-seeded counts for all_in ministries (R5) — no forced zero', () => {
      const rows = buildMinistryPrepareSummary({
        ministries: [{ id: 'ministry-1', name: 'All-In Ministry' }],
        sentCycleIds: ['cycle-1'],
        eventsByMinistryId: {
          'ministry-1': [{ cycleId: 'cycle-1' }],
        },
        eventTimeBlockCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 12,
        },
      });

      expect(rows[0]?.eventTimeBlockCount).toBe(12);
    });

    it('handles zero sent cycles', () => {
      const rows = buildMinistryPrepareSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        sentCycleIds: [],
        eventsByMinistryId: {
          'ministry-1': [{ cycleId: 'cycle-1' }],
        },
        eventTimeBlockCountByMinistryAndCycle: { 'ministry-1:cycle-1': 5 },
      });

      expect(rows[0]).toMatchObject({ eventCount: 0, eventTimeBlockCount: 0 });
    });
  });
});

describe('formatTimeRange (#159 — church-time seam, one format, non-UTC ambient TZ)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland';
  });

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('formats a Slot time range on the Church Timezone wall clock (dd/MM/yyyy HH:mm – HH:mm)', () => {
    // 09:00–11:00 church-local in America/Sao_Paulo (UTC-3).
    expect(
      formatTimeRange({
        start: '2027-01-04T12:00:00.000Z',
        end: '2027-01-04T14:00:00.000Z',
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('04/01/2027 09:00 – 11:00');
  });

  it('formats a Shift time range that crosses midnight with a second date', () => {
    // 22:00 Monday to 02:00 Tuesday church-local in America/Sao_Paulo.
    expect(
      formatTimeRange({
        start: '2027-01-05T01:00:00.000Z',
        end: '2027-01-05T05:00:00.000Z',
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('04/01/2027 22:00 – 05/01/2027 02:00');
  });
});

describe('toCalendarDateString', () => {
  it('keeps a UTC-midnight cycle bound on the day it names', () => {
    // Cycle bounds name a day rather than a moment, so the UTC prefix is the
    // intended value. Slot timestamps are real wall-clock instants and must go
    // through `toLocalDayKey` instead.
    expect(toCalendarDateString('2026-07-10T00:00:00.000Z')).toBe('2026-07-10');
  });
});

describe('buildEventTimeBlockDayMarkers', () => {
  describe('Happy Path', () => {
    it('marks the day of a single visible slot', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                slot: {
                  id: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                },
              },
            ],
          }),
        ],
        timeZone: 'UTC',
      });

      expect([...markers]).toEqual(['2026-07-12']);
    });

    it('marks only the days that actually have slots', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                slot: {
                  id: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                },
              },
              {
                slot: {
                  id: 'event-time-block-2',
                  startTime: '2026-07-14T09:00:00.000Z',
                },
              },
            ],
          }),
        ],
        timeZone: 'UTC',
      });

      expect([...markers].sort()).toEqual(['2026-07-12', '2026-07-14']);
    });
  });

  describe('Timezone', () => {
    // The Church Timezone is an explicit parameter, never the ambient
    // process TZ — proven by setting the ambient TZ to a zone other than
    // the Church Timezone under test and confirming the result still
    // follows the explicit `timeZone`, not the environment.
    const ORIGINAL_TZ = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = 'Pacific/Auckland';
    });

    afterAll(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    it('marks an evening slot on the day it is served in the Church Timezone, not the next UTC day', () => {
      // A 21:00 church-local Monday slot is stored as 00:00Z Tuesday.
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                slot: {
                  id: 'event-time-block-1',
                  startTime: '2027-01-05T00:00:00.000Z',
                },
              },
            ],
          }),
        ],
        timeZone: 'America/Sao_Paulo',
      });

      expect([...markers]).toEqual(['2027-01-04']);
    });

    it('marks a morning slot on its own day in the Church Timezone', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                slot: {
                  id: 'event-time-block-1',
                  startTime: '2027-01-04T12:00:00.000Z',
                },
              },
            ],
          }),
        ],
        timeZone: 'America/Sao_Paulo',
      });

      expect([...markers]).toEqual(['2027-01-04']);
    });
  });

  describe('Edge Cases', () => {
    it('returns an empty set for zero events', () => {
      expect(
        buildEventTimeBlockDayMarkers({ events: [], timeZone: 'UTC' }).size,
      ).toBe(0);
    });

    it('deduplicates multiple slots on the same day', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                slot: {
                  id: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                },
              },
              {
                slot: {
                  id: 'event-time-block-2',
                  startTime: '2026-07-12T11:00:00.000Z',
                },
              },
            ],
          }),
        ],
        timeZone: 'UTC',
      });

      expect(markers.size).toBe(1);
    });
  });
});

describe('filterEventTimeBlocksByName (T008/FR-010)', () => {
  describe('Happy Path', () => {
    it('keeps slots whose label matches the query', () => {
      const events = [
        makeEventView({
          eventTimeBlockOverrides: [
            { slot: { label: 'Greeter' } },
            { slot: { id: 'event-time-block-2', label: 'Usher' } },
          ],
        }),
      ];

      const filtered = filterEventTimeBlocksByName({ events, query: 'greet' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.slots).toHaveLength(1);
      expect(filtered[0]?.slots[0]?.slot.label).toBe('Greeter');
    });

    it('matches against the parent event title too', () => {
      const events = [
        makeEventView({
          event: {
            title: 'Youth Night',
          } as GetCycleParticipation200EventsItem['event'],
        }),
      ];

      const filtered = filterEventTimeBlocksByName({ events, query: 'youth' });
      expect(filtered).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('returns events unchanged for an empty/whitespace query', () => {
      const events = [makeEventView()];
      expect(filterEventTimeBlocksByName({ events, query: '   ' })).toEqual(
        events,
      );
    });

    it('drops an event entirely once it has zero matching slots', () => {
      const events = [makeEventView()];
      expect(
        filterEventTimeBlocksByName({ events, query: 'no-match' }),
      ).toEqual([]);
    });

    it('is case-insensitive', () => {
      const events = [makeEventView()];
      expect(
        filterEventTimeBlocksByName({ events, query: 'GREETER' }),
      ).toHaveLength(1);
    });
  });
});

describe('filterEventTimeBlocksByTimeOfDay (T008/FR-010, mode select + single start/end pair)', () => {
  const morningAndEvening = () =>
    makeEventView({
      eventTimeBlockOverrides: [
        {
          slot: {
            id: 'morning',
            startTime: '2026-07-12T08:00:00.000Z',
            endTime: '2026-07-12T09:00:00.000Z',
          },
        },
        {
          slot: {
            id: 'evening',
            startTime: '2026-07-12T20:00:00.000Z',
            endTime: '2026-07-12T21:00:00.000Z',
          },
        },
      ],
    });

  describe('Happy Path', () => {
    it('mode "starts": keeps only slots whose start time falls in [start, end]', () => {
      const filtered = filterEventTimeBlocksByTimeOfDay({
        events: [morningAndEvening()],
        filter: {
          mode: 'starts',
          start: parseTimeOfDay({ value: '18:00' }),
          end: parseTimeOfDay({ value: '23:00' }),
        },
        timeZone: 'UTC',
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['evening']);
    });

    it('mode "ends": keeps only slots whose end time falls in [start, end]', () => {
      const events = [
        makeEventView({
          eventTimeBlockOverrides: [
            {
              slot: {
                id: 'short',
                startTime: '2026-07-12T09:00:00.000Z',
                endTime: '2026-07-12T09:30:00.000Z',
              },
            },
            {
              slot: {
                id: 'long',
                startTime: '2026-07-12T09:00:00.000Z',
                endTime: '2026-07-12T11:30:00.000Z',
              },
            },
          ],
        }),
      ];

      const filtered = filterEventTimeBlocksByTimeOfDay({
        events,
        filter: {
          mode: 'ends',
          start: parseTimeOfDay({ value: '11:00' }),
          end: parseTimeOfDay({ value: '12:00' }),
        },
        timeZone: 'UTC',
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['long']);
    });

    it('mode "within": keeps only slots whose entire span fits in [start, end]', () => {
      const events = [
        makeEventView({
          eventTimeBlockOverrides: [
            {
              slot: {
                id: 'fits',
                startTime: '2026-07-12T18:00:00.000Z',
                endTime: '2026-07-12T19:00:00.000Z',
              },
            },
            {
              slot: {
                id: 'overruns',
                startTime: '2026-07-12T18:00:00.000Z',
                endTime: '2026-07-12T23:00:00.000Z',
              },
            },
          ],
        }),
      ];

      const filtered = filterEventTimeBlocksByTimeOfDay({
        events,
        filter: {
          mode: 'within',
          start: parseTimeOfDay({ value: '17:00' }),
          end: parseTimeOfDay({ value: '20:00' }),
        },
        timeZone: 'UTC',
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['fits']);
    });

    it('supports an open-ended window (only start bound given)', () => {
      const filtered = filterEventTimeBlocksByTimeOfDay({
        events: [morningAndEvening()],
        filter: { mode: 'starts', start: parseTimeOfDay({ value: '12:00' }) },
        timeZone: 'UTC',
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['evening']);
    });

    it('supports an open-ended window (only end bound given)', () => {
      const filtered = filterEventTimeBlocksByTimeOfDay({
        events: [morningAndEvening()],
        filter: { mode: 'starts', end: parseTimeOfDay({ value: '12:00' }) },
        timeZone: 'UTC',
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['morning']);
    });
  });

  describe('Edge Cases', () => {
    it('returns events unchanged when both start and end are empty, regardless of mode', () => {
      const events = [makeEventView()];
      expect(
        filterEventTimeBlocksByTimeOfDay({
          events,
          filter: { mode: 'within' },
          timeZone: 'UTC',
        }),
      ).toEqual(events);
    });

    it('drops an event entirely once it has zero matching slots', () => {
      const events = [morningAndEvening()];
      expect(
        filterEventTimeBlocksByTimeOfDay({
          events,
          filter: { mode: 'starts', start: parseTimeOfDay({ value: '23:30' }) },
          timeZone: 'UTC',
        }),
      ).toEqual([]);
    });

    it('treats boundary values as inclusive', () => {
      const events = [
        makeEventView({
          eventTimeBlockOverrides: [
            {
              slot: {
                id: 'on-the-dot',
                startTime: '2026-07-12T09:00:00.000Z',
                endTime: '2026-07-12T10:00:00.000Z',
              },
            },
          ],
        }),
      ];

      expect(
        filterEventTimeBlocksByTimeOfDay({
          events,
          filter: {
            mode: 'starts',
            start: parseTimeOfDay({ value: '09:00' }),
            end: parseTimeOfDay({ value: '09:00' }),
          },
          timeZone: 'UTC',
        })[0]?.slots,
      ).toHaveLength(1);
    });
  });
});

describe('isTimeWindowFilterEmpty', () => {
  it('is true when both start and end are undefined', () => {
    expect(isTimeWindowFilterEmpty({ mode: 'starts' })).toBe(true);
  });

  it('is false when either bound is set', () => {
    expect(
      isTimeWindowFilterEmpty({
        mode: 'ends',
        end: parseTimeOfDay({ value: '20:00' }),
      }),
    ).toBe(false);
  });
});

describe('validateManualSpans (T023 — reused/extended for manual-split-editor)', () => {
  describe('Happy Path', () => {
    it('accepts spans fully within slot bounds, in order, non-overlapping', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              label: '',
            },
            {
              startTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBeNull();
    });

    it('accepts spans given out of chronological order', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
              label: '',
            },
            {
              startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('rejects a span with identical start and end (zero duration)', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBe('Each manual shift must end after it starts.');
    });

    it('rejects a span that ends before it starts', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBe('Each manual shift must end after it starts.');
    });

    it('rejects a span starting before the parent slot bounds', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T08:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts must stay within the parent slot bounds.');
    });

    it('rejects a span ending after the parent slot bounds', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T12:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts must stay within the parent slot bounds.');
    });

    it('rejects overlapping spans (including touching-but-crossing bounds)', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T10:30:00Z' }),
              label: '',
            },
            {
              startTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts cannot overlap.');
    });

    it('accepts back-to-back spans that touch at the boundary without overlapping', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              label: '',
            },
            {
              startTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBeNull();
    });

    it('accepts manual spans within a parent EventTimeBlock whose own bounds cross midnight', () => {
      const overnightEventTimeBlockView: GetCycleParticipation200EventsItem['slots'][number] =
        {
          ...EVENT_TIME_BLOCK_VIEW,
          slot: {
            ...EVENT_TIME_BLOCK_VIEW.slot,
            startTime: '2026-07-12T22:00:00Z',
            endTime: '2026-07-13T02:00:00Z',
          },
        };

      expect(
        validateManualSpans({
          eventTimeBlockView: overnightEventTimeBlockView,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T22:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-13T00:00:00Z' }),
              label: '',
            },
            {
              startTime: parseInstant({ value: '2026-07-13T00:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-13T02:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBeNull();
    });

    it('rejects a manual span that starts before an overnight parent EventTimeBlock even though its wall-clock time reads later in the day', () => {
      const overnightEventTimeBlockView: GetCycleParticipation200EventsItem['slots'][number] =
        {
          ...EVENT_TIME_BLOCK_VIEW,
          slot: {
            ...EVENT_TIME_BLOCK_VIEW.slot,
            startTime: '2026-07-12T22:00:00Z',
            endTime: '2026-07-13T02:00:00Z',
          },
        };

      expect(
        validateManualSpans({
          eventTimeBlockView: overnightEventTimeBlockView,
          spans: [
            {
              startTime: parseInstant({ value: '2026-07-12T20:00:00Z' }),
              endTime: parseInstant({ value: '2026-07-13T01:00:00Z' }),
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts must stay within the parent slot bounds.');
    });
  });

  describe('Invalid / Empty Input', () => {
    it('accepts zero spans (nothing to validate yet)', () => {
      expect(
        validateManualSpans({
          eventTimeBlockView: EVENT_TIME_BLOCK_VIEW,
          spans: [],
        }),
      ).toBeNull();
    });
  });
});

describe('createInitialSplitForms defaults to single-shift (bugfix)', () => {
  it('defaults equalCount to 1 (single shift) for a slot with exactly one server-default shift', () => {
    const forms = createInitialSplitForms([
      makeEventView({
        eventTimeBlockOverrides: [
          {
            included: true,
            shifts: [
              {
                id: 'shift-1',
                participationId: 'participation-1',
                eventTimeBlockId: 'event-time-block-1',
                startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
                endTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
              },
            ],
          },
        ],
      }),
    ]);

    expect(forms['event-time-block-1']).toMatchObject({
      mode: 'equal',
      equalCount: '1',
    });
  });

  it('defaults equalCount to 1 when a slot has zero shifts yet', () => {
    const forms = createInitialSplitForms([
      makeEventView({
        eventTimeBlockOverrides: [{ included: false, shifts: [] }],
      }),
    ]);

    expect(forms['event-time-block-1']).toMatchObject({
      mode: 'equal',
      equalCount: '1',
    });
  });

  it('preserves an existing multi-shift count instead of forcing single', () => {
    const forms = createInitialSplitForms([
      makeEventView({
        eventTimeBlockOverrides: [
          {
            included: true,
            shifts: [
              {
                id: 'shift-1',
                participationId: 'participation-1',
                eventTimeBlockId: 'event-time-block-1',
                startTime: parseInstant({ value: '2026-07-12T09:00:00Z' }),
                endTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
              },
              {
                id: 'shift-2',
                participationId: 'participation-1',
                eventTimeBlockId: 'event-time-block-1',
                startTime: parseInstant({ value: '2026-07-12T10:00:00Z' }),
                endTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
              },
              {
                id: 'shift-3',
                participationId: 'participation-1',
                eventTimeBlockId: 'event-time-block-1',
                startTime: parseInstant({ value: '2026-07-12T11:00:00Z' }),
                endTime: parseInstant({ value: '2026-07-12T12:00:00Z' }),
              },
            ],
          },
        ],
      }),
    ]);

    expect(forms['event-time-block-1']).toMatchObject({
      mode: 'equal',
      equalCount: '3',
    });
  });
});

describe('participationStateLabel', () => {
  it('shows the glossary stage words', () => {
    expect(
      (
        [
          'preparing',
          'availability_requested',
          'assigning',
          'published',
        ] as const
      ).map((state) => participationStateLabel({ state })),
    ).toEqual([
      'Preparing',
      'Availability requested',
      'Assigning',
      'Published',
    ]);
  });
});
