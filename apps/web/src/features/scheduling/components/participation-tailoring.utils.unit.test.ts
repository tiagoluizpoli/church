import { describe, expect, it } from 'vitest';
import {
  buildEventDayMarkers,
  buildMinistryTailoringSummary,
  createInitialSplitForms,
  filterSlotsByName,
  filterSlotsByTimeOfDay,
  isTimeWindowFilterEmpty,
  toIsoDateString,
  toMinistryCycleKey,
  validateManualSpans,
} from './participation-tailoring.utils';
import type { GetCycleParticipation200EventsItem } from '@/infrastructure/api/churchAPI.schemas';

const SLOT_VIEW: GetCycleParticipation200EventsItem['slots'][number] = {
  slot: {
    id: 'slot-1',
    churchId: 'church-1',
    eventId: 'event-1',
    startTime: '2026-07-12T09:00:00',
    endTime: '2026-07-12T11:00:00',
    label: 'Greeter',
    status: 'active',
    requirements: [],
  },
  included: true,
  shifts: [],
  requirements: [],
};

type SlotViewOverride = {
  slot?: Partial<GetCycleParticipation200EventsItem['slots'][number]['slot']>;
  included?: boolean;
  shifts?: GetCycleParticipation200EventsItem['slots'][number]['shifts'];
  requirements?: GetCycleParticipation200EventsItem['slots'][number]['requirements'];
};

function makeEventView(
  overrides: Partial<GetCycleParticipation200EventsItem> & {
    slotOverrides?: SlotViewOverride[];
  } = {},
): GetCycleParticipation200EventsItem {
  const { slotOverrides, ...eventOverrides } = overrides;

  return {
    participation: {
      id: 'participation-1',
      churchId: 'church-1',
      ministryId: 'ministry-1',
      eventId: 'event-1',
      state: 'tailoring',
    },
    event: {
      id: 'event-1',
      churchId: 'church-1',
      planningCycleId: 'cycle-1',
      title: 'Sunday Service',
      startDate: '2026-07-12T09:00:00',
      endDate: '2026-07-12T11:00:00',
      status: 'scheduled',
      eventType: 'hourly',
      createdAt: '2026-07-01T00:00:00',
      updatedAt: '2026-07-01T00:00:00',
    },
    slots: (
      slotOverrides ?? [
        {
          slot: {
            id: 'slot-1',
            churchId: 'church-1',
            eventId: 'event-1',
            startTime: '2026-07-12T09:00:00',
            endTime: '2026-07-12T10:00:00',
            label: 'Greeter',
            status: 'active',
            requirements: [],
          },
          included: true,
          shifts: [],
          requirements: [],
        },
      ]
    ).map((slotOverride) => ({
      slot: {
        id: 'slot-1',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: '2026-07-12T09:00:00',
        endTime: '2026-07-12T10:00:00',
        label: 'Greeter',
        status: 'active',
        requirements: [],
        ...slotOverride.slot,
      },
      included: slotOverride.included ?? true,
      shifts: slotOverride.shifts ?? [],
      requirements: slotOverride.requirements ?? [],
    })),
    ...eventOverrides,
  };
}

describe('toMinistryCycleKey', () => {
  it('joins ministryId and cycleId with a colon', () => {
    expect(
      toMinistryCycleKey({ ministryId: 'ministry-1', cycleId: 'cycle-1' }),
    ).toBe('ministry-1:cycle-1');
  });
});

describe('buildMinistryTailoringSummary (T006/R10)', () => {
  describe('Happy Path', () => {
    it('sums event/slot counts intersected with the locked-cycle set', () => {
      const rows = buildMinistryTailoringSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        lockedCycleIds: ['cycle-1'],
        eventsByMinistryId: {
          'ministry-1': [
            { planningCycleId: 'cycle-1' },
            { planningCycleId: 'cycle-1' },
          ],
        },
        slotCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 5,
        },
      });

      expect(rows).toEqual([
        {
          ministryId: 'ministry-1',
          ministryName: 'Greeters',
          eventCount: 2,
          slotCount: 5,
        },
      ]);
    });

    it('sums slot counts across 2+ concurrently locked cycles', () => {
      const rows = buildMinistryTailoringSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        lockedCycleIds: ['cycle-1', 'cycle-2'],
        eventsByMinistryId: {
          'ministry-1': [
            { planningCycleId: 'cycle-1' },
            { planningCycleId: 'cycle-2' },
          ],
        },
        slotCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 3,
          'ministry-1:cycle-2': 4,
        },
      });

      expect(rows[0]).toMatchObject({ eventCount: 2, slotCount: 7 });
    });
  });

  describe('Edge Cases', () => {
    it('returns 0/0 for an untouched ministry with no events', () => {
      const rows = buildMinistryTailoringSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        lockedCycleIds: ['cycle-1'],
        eventsByMinistryId: {},
        slotCountByMinistryAndCycle: {},
      });

      expect(rows).toEqual([
        {
          ministryId: 'ministry-1',
          ministryName: 'Greeters',
          eventCount: 0,
          slotCount: 0,
        },
      ]);
    });

    it('excludes events whose cycle is not in the locked set (draft/archived)', () => {
      const rows = buildMinistryTailoringSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        lockedCycleIds: ['cycle-1'],
        eventsByMinistryId: {
          'ministry-1': [
            { planningCycleId: 'cycle-1' },
            { planningCycleId: 'cycle-draft' },
          ],
        },
        slotCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 2,
          'ministry-1:cycle-draft': 99,
        },
      });

      expect(rows[0]).toMatchObject({ eventCount: 1, slotCount: 2 });
    });

    it('reflects non-zero pre-seeded counts for all_in ministries (R5) — no forced zero', () => {
      const rows = buildMinistryTailoringSummary({
        ministries: [{ id: 'ministry-1', name: 'All-In Ministry' }],
        lockedCycleIds: ['cycle-1'],
        eventsByMinistryId: {
          'ministry-1': [{ planningCycleId: 'cycle-1' }],
        },
        slotCountByMinistryAndCycle: {
          'ministry-1:cycle-1': 12,
        },
      });

      expect(rows[0]?.slotCount).toBe(12);
    });

    it('handles zero locked cycles', () => {
      const rows = buildMinistryTailoringSummary({
        ministries: [{ id: 'ministry-1', name: 'Greeters' }],
        lockedCycleIds: [],
        eventsByMinistryId: {
          'ministry-1': [{ planningCycleId: 'cycle-1' }],
        },
        slotCountByMinistryAndCycle: { 'ministry-1:cycle-1': 5 },
      });

      expect(rows[0]).toMatchObject({ eventCount: 0, slotCount: 0 });
    });
  });
});

describe('toIsoDateString', () => {
  it('formats a local date as yyyy-MM-dd', () => {
    expect(toIsoDateString(new Date(2026, 6, 12))).toBe('2026-07-12');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toIsoDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('buildEventDayMarkers (T007/R3)', () => {
  describe('Happy Path', () => {
    it('marks every day in a single-day event', () => {
      const markers = buildEventDayMarkers({
        events: [
          { startDate: '2026-07-12T09:00:00', endDate: '2026-07-12T11:00:00' },
        ],
      });

      expect([...markers]).toEqual(['2026-07-12']);
    });

    it('marks every day across a multi-day event span', () => {
      const markers = buildEventDayMarkers({
        events: [
          { startDate: '2026-07-12T09:00:00', endDate: '2026-07-14T11:00:00' },
        ],
      });

      expect([...markers].sort()).toEqual([
        '2026-07-12',
        '2026-07-13',
        '2026-07-14',
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('returns an empty set for zero events', () => {
      expect(buildEventDayMarkers({ events: [] }).size).toBe(0);
    });

    it('deduplicates overlapping event spans', () => {
      const markers = buildEventDayMarkers({
        events: [
          { startDate: '2026-07-12T09:00:00', endDate: '2026-07-13T09:00:00' },
          { startDate: '2026-07-13T09:00:00', endDate: '2026-07-14T09:00:00' },
        ],
      });

      expect(markers.size).toBe(3);
    });
  });
});

describe('filterSlotsByName (T008/FR-010)', () => {
  describe('Happy Path', () => {
    it('keeps slots whose label matches the query', () => {
      const events = [
        makeEventView({
          slotOverrides: [
            { slot: { label: 'Greeter' } },
            { slot: { id: 'slot-2', label: 'Usher' } },
          ],
        }),
      ];

      const filtered = filterSlotsByName({ events, query: 'greet' });
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

      const filtered = filterSlotsByName({ events, query: 'youth' });
      expect(filtered).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('returns events unchanged for an empty/whitespace query', () => {
      const events = [makeEventView()];
      expect(filterSlotsByName({ events, query: '   ' })).toEqual(events);
    });

    it('drops an event entirely once it has zero matching slots', () => {
      const events = [makeEventView()];
      expect(filterSlotsByName({ events, query: 'no-match' })).toEqual([]);
    });

    it('is case-insensitive', () => {
      const events = [makeEventView()];
      expect(filterSlotsByName({ events, query: 'GREETER' })).toHaveLength(1);
    });
  });
});

describe('filterSlotsByTimeOfDay (T008/FR-010, mode select + single start/end pair)', () => {
  const morningAndEvening = () =>
    makeEventView({
      slotOverrides: [
        {
          slot: {
            id: 'morning',
            startTime: '2026-07-12T08:00:00',
            endTime: '2026-07-12T09:00:00',
          },
        },
        {
          slot: {
            id: 'evening',
            startTime: '2026-07-12T20:00:00',
            endTime: '2026-07-12T21:00:00',
          },
        },
      ],
    });

  describe('Happy Path', () => {
    it('mode "starts": keeps only slots whose start time falls in [start, end]', () => {
      const filtered = filterSlotsByTimeOfDay({
        events: [morningAndEvening()],
        filter: { mode: 'starts', start: '18:00', end: '23:00' },
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['evening']);
    });

    it('mode "ends": keeps only slots whose end time falls in [start, end]', () => {
      const events = [
        makeEventView({
          slotOverrides: [
            {
              slot: {
                id: 'short',
                startTime: '2026-07-12T09:00:00',
                endTime: '2026-07-12T09:30:00',
              },
            },
            {
              slot: {
                id: 'long',
                startTime: '2026-07-12T09:00:00',
                endTime: '2026-07-12T11:30:00',
              },
            },
          ],
        }),
      ];

      const filtered = filterSlotsByTimeOfDay({
        events,
        filter: { mode: 'ends', start: '11:00', end: '12:00' },
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['long']);
    });

    it('mode "within": keeps only slots whose entire span fits in [start, end]', () => {
      const events = [
        makeEventView({
          slotOverrides: [
            {
              slot: {
                id: 'fits',
                startTime: '2026-07-12T18:00:00',
                endTime: '2026-07-12T19:00:00',
              },
            },
            {
              slot: {
                id: 'overruns',
                startTime: '2026-07-12T18:00:00',
                endTime: '2026-07-12T23:00:00',
              },
            },
          ],
        }),
      ];

      const filtered = filterSlotsByTimeOfDay({
        events,
        filter: { mode: 'within', start: '17:00', end: '20:00' },
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['fits']);
    });

    it('supports an open-ended window (only start bound given)', () => {
      const filtered = filterSlotsByTimeOfDay({
        events: [morningAndEvening()],
        filter: { mode: 'starts', start: '12:00' },
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['evening']);
    });

    it('supports an open-ended window (only end bound given)', () => {
      const filtered = filterSlotsByTimeOfDay({
        events: [morningAndEvening()],
        filter: { mode: 'starts', end: '12:00' },
      });

      expect(filtered[0]?.slots.map((s) => s.slot.id)).toEqual(['morning']);
    });
  });

  describe('Edge Cases', () => {
    it('returns events unchanged when both start and end are empty, regardless of mode', () => {
      const events = [makeEventView()];
      expect(
        filterSlotsByTimeOfDay({ events, filter: { mode: 'within' } }),
      ).toEqual(events);
    });

    it('drops an event entirely once it has zero matching slots', () => {
      const events = [makeEventView()];
      expect(
        filterSlotsByTimeOfDay({
          events,
          filter: { mode: 'starts', start: '23:00' },
        }),
      ).toEqual([]);
    });

    it('treats boundary values as inclusive', () => {
      const events = [
        makeEventView({
          slotOverrides: [
            {
              slot: {
                id: 'on-the-dot',
                startTime: '2026-07-12T09:00:00',
                endTime: '2026-07-12T10:00:00',
              },
            },
          ],
        }),
      ];

      expect(
        filterSlotsByTimeOfDay({
          events,
          filter: { mode: 'starts', start: '09:00', end: '09:00' },
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
    expect(isTimeWindowFilterEmpty({ mode: 'ends', end: '20:00' })).toBe(false);
  });
});

describe('validateManualSpans (T023 — reused/extended for manual-split-editor)', () => {
  describe('Happy Path', () => {
    it('accepts spans fully within slot bounds, in order, non-overlapping', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T09:00:00',
              endTime: '2026-07-12T10:00:00',
              label: '',
            },
            {
              startTime: '2026-07-12T10:00:00',
              endTime: '2026-07-12T11:00:00',
              label: '',
            },
          ],
        }),
      ).toBeNull();
    });

    it('accepts spans given out of chronological order', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T10:00:00',
              endTime: '2026-07-12T11:00:00',
              label: '',
            },
            {
              startTime: '2026-07-12T09:00:00',
              endTime: '2026-07-12T10:00:00',
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
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T09:00:00',
              endTime: '2026-07-12T09:00:00',
              label: '',
            },
          ],
        }),
      ).toBe('Each manual shift must end after it starts.');
    });

    it('rejects a span that ends before it starts', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T10:00:00',
              endTime: '2026-07-12T09:00:00',
              label: '',
            },
          ],
        }),
      ).toBe('Each manual shift must end after it starts.');
    });

    it('rejects a span starting before the parent slot bounds', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T08:00:00',
              endTime: '2026-07-12T10:00:00',
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts must stay within the parent slot bounds.');
    });

    it('rejects a span ending after the parent slot bounds', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T09:00:00',
              endTime: '2026-07-12T12:00:00',
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts must stay within the parent slot bounds.');
    });

    it('rejects overlapping spans (including touching-but-crossing bounds)', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T09:00:00',
              endTime: '2026-07-12T10:30:00',
              label: '',
            },
            {
              startTime: '2026-07-12T10:00:00',
              endTime: '2026-07-12T11:00:00',
              label: '',
            },
          ],
        }),
      ).toBe('Manual shifts cannot overlap.');
    });

    it('accepts back-to-back spans that touch at the boundary without overlapping', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [
            {
              startTime: '2026-07-12T09:00:00',
              endTime: '2026-07-12T10:00:00',
              label: '',
            },
            {
              startTime: '2026-07-12T10:00:00',
              endTime: '2026-07-12T11:00:00',
              label: '',
            },
          ],
        }),
      ).toBeNull();
    });
  });

  describe('Invalid / Empty Input', () => {
    it('rejects a span with an unparseable time', () => {
      expect(
        validateManualSpans({
          slotView: SLOT_VIEW,
          spans: [{ startTime: '', endTime: '2026-07-12T10:00:00', label: '' }],
        }),
      ).toBe('Fill every manual shift time before saving.');
    });

    it('accepts zero spans (nothing to validate yet)', () => {
      expect(
        validateManualSpans({ slotView: SLOT_VIEW, spans: [] }),
      ).toBeNull();
    });
  });
});

describe('createInitialSplitForms defaults to single-shift (bugfix)', () => {
  it('defaults equalCount to 1 (single shift) for a slot with exactly one server-default shift', () => {
    const forms = createInitialSplitForms([
      makeEventView({
        slotOverrides: [
          {
            included: true,
            shifts: [
              {
                id: 'shift-1',
                participationId: 'participation-1',
                timeSlotId: 'slot-1',
                startTime: '2026-07-12T09:00:00',
                endTime: '2026-07-12T11:00:00',
              },
            ],
          },
        ],
      }),
    ]);

    expect(forms['slot-1']).toMatchObject({ mode: 'equal', equalCount: '1' });
  });

  it('defaults equalCount to 1 when a slot has zero shifts yet', () => {
    const forms = createInitialSplitForms([
      makeEventView({ slotOverrides: [{ included: false, shifts: [] }] }),
    ]);

    expect(forms['slot-1']).toMatchObject({ mode: 'equal', equalCount: '1' });
  });

  it('preserves an existing multi-shift count instead of forcing single', () => {
    const forms = createInitialSplitForms([
      makeEventView({
        slotOverrides: [
          {
            included: true,
            shifts: [
              {
                id: 'shift-1',
                participationId: 'participation-1',
                timeSlotId: 'slot-1',
                startTime: '2026-07-12T09:00:00',
                endTime: '2026-07-12T10:00:00',
              },
              {
                id: 'shift-2',
                participationId: 'participation-1',
                timeSlotId: 'slot-1',
                startTime: '2026-07-12T10:00:00',
                endTime: '2026-07-12T11:00:00',
              },
              {
                id: 'shift-3',
                participationId: 'participation-1',
                timeSlotId: 'slot-1',
                startTime: '2026-07-12T11:00:00',
                endTime: '2026-07-12T12:00:00',
              },
            ],
          },
        ],
      }),
    ]);

    expect(forms['slot-1']).toMatchObject({ mode: 'equal', equalCount: '3' });
  });
});
