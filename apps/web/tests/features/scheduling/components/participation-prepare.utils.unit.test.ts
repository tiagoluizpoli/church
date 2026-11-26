import { parseTimeOfDay } from '@church/time';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  blockTitle,
  buildEventTimeBlockDayMarkers,
  buildMinistryPrepareSummary,
  coverageTone,
  isTimeWindowFilterEmpty,
  toCalendarDateString,
  toScheduleKey,
} from '@/features/scheduling/components/participation-prepare.utils';
import type { GetCycleParticipation200EventsItem } from '@/infrastructure/api/churchAPI.schemas';

const _EVENT_TIME_BLOCK_VIEW: GetCycleParticipation200EventsItem['eventTimeBlocks'][number] =
  {
    eventTimeBlock: {
      id: 'event-time-block-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-07-12T09:00:00Z',
      endTime: '2026-07-12T11:00:00Z',
      label: 'Greeter',
      isPublic: false,
      place: null,
      placeAddressId: null,
      status: 'active',
      requirements: [],
    },
    included: true,
    cancelled: false,
    shifts: [],
    requirements: [],
    shiftsChangedAfterAsk: false,
    answerCoverage: { available: 0, needed: null },
  };

type EventTimeBlockViewOverride = {
  eventTimeBlock?: Partial<
    GetCycleParticipation200EventsItem['eventTimeBlocks'][number]['eventTimeBlock']
  >;
  included?: boolean;
  shifts?: GetCycleParticipation200EventsItem['eventTimeBlocks'][number]['shifts'];
  requirements?: GetCycleParticipation200EventsItem['eventTimeBlocks'][number]['requirements'];
};

function makeEventView(
  overrides: Partial<GetCycleParticipation200EventsItem> & {
    eventTimeBlockOverrides?: EventTimeBlockViewOverride[];
  } = {},
): GetCycleParticipation200EventsItem {
  const { eventTimeBlockOverrides, ...eventOverrides } = overrides;

  return {
    generatedFromTemplate: false,
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
    eventTimeBlocks: (
      eventTimeBlockOverrides ?? [
        {
          eventTimeBlock: {
            id: 'event-time-block-1',
            churchId: 'church-1',
            eventId: 'event-1',
            startTime: '2026-07-12T09:00:00Z',
            endTime: '2026-07-12T10:00:00Z',
            label: 'Greeter',
            isPublic: false,
            place: null,
            placeAddressId: null,
            status: 'active',
            requirements: [],
          },
          included: true,
          shifts: [],
          requirements: [],
          shiftsChangedAfterAsk: false,
          answerCoverage: { available: 0, needed: null },
        },
      ]
    ).map((eventTimeBlockOverride) => ({
      eventTimeBlock: {
        id: 'event-time-block-1',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: '2026-07-12T09:00:00Z',
        endTime: '2026-07-12T10:00:00Z',
        label: 'Greeter',
        isPublic: false,
        place: null,
        placeAddressId: null,
        status: 'active',
        requirements: [],
        ...eventTimeBlockOverride.eventTimeBlock,
      },
      included: eventTimeBlockOverride.included ?? true,
      cancelled: false,
      shifts: eventTimeBlockOverride.shifts ?? [],
      requirements: eventTimeBlockOverride.requirements ?? [],
      shiftsChangedAfterAsk: false,
      answerCoverage: { available: 0, needed: null },
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
    it('sums event/time block counts intersected with the sent-cycle set', () => {
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

    it('sums time block counts across 2+ concurrently sent cycles', () => {
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

describe('toCalendarDateString', () => {
  it('keeps a UTC-midnight cycle bound on the day it names', () => {
    // Cycle bounds name a day rather than a moment, so the UTC prefix is the
    // intended value. Time block timestamps are real wall-clock instants and must go
    // through `toLocalDayKey` instead.
    expect(toCalendarDateString('2026-07-10T00:00:00.000Z')).toBe('2026-07-10');
  });
});

describe('buildEventTimeBlockDayMarkers', () => {
  describe('Happy Path', () => {
    it('marks the day of a single visible time block', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                eventTimeBlock: {
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

    it('marks only the days that actually have time blocks', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                eventTimeBlock: {
                  id: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                },
              },
              {
                eventTimeBlock: {
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

    it('marks an evening time block on the day it is served in the Church Timezone, not the next UTC day', () => {
      // A 21:00 church-local Monday time block is stored as 00:00Z Tuesday.
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                eventTimeBlock: {
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

    it('marks a morning time block on its own day in the Church Timezone', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                eventTimeBlock: {
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

    it('deduplicates multiple time blocks on the same day', () => {
      const markers = buildEventTimeBlockDayMarkers({
        events: [
          makeEventView({
            eventTimeBlockOverrides: [
              {
                eventTimeBlock: {
                  id: 'event-time-block-1',
                  startTime: '2026-07-12T09:00:00.000Z',
                },
              },
              {
                eventTimeBlock: {
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

describe('blockTitle', () => {
  it('drops a label that only repeats the event and its start time', () => {
    expect(
      blockTitle({
        eventTitle: 'Culto de Domingo',
        label: 'Culto 10:30',
        startTime: '10:30',
      }),
    ).toBe('Culto de Domingo');
  });

  it('keeps a label that adds information', () => {
    expect(
      blockTitle({
        eventTitle: 'Culto de Domingo',
        label: 'Manhã',
        startTime: '10:30',
      }),
    ).toBe('Culto de Domingo · Manhã');
  });

  it('shows the event alone when the block has no label', () => {
    expect(
      blockTitle({ eventTitle: 'Culto', label: '', startTime: '19:00' }),
    ).toBe('Culto');
  });
});

describe('coverageTone', () => {
  it('stays neutral while pending answers could still fill the block', () => {
    expect(
      coverageTone({
        available: 1,
        needed: 12,
        pending: 149,
        answersClosed: false,
      }),
    ).toBe('neutral');
  });

  it('flags a shortfall pending answers cannot fill', () => {
    expect(
      coverageTone({
        available: 1,
        needed: 12,
        pending: 3,
        answersClosed: false,
      }),
    ).toBe('short');
  });

  it('applies the meter thresholds once answers are closed', () => {
    expect(
      coverageTone({
        available: 1,
        needed: 12,
        pending: 149,
        answersClosed: true,
      }),
    ).toBe('short');
    expect(
      coverageTone({
        available: 6,
        needed: 12,
        pending: 0,
        answersClosed: true,
      }),
    ).toBe('low');
    expect(
      coverageTone({
        available: 12,
        needed: 12,
        pending: 0,
        answersClosed: true,
      }),
    ).toBe('neutral');
  });
});
