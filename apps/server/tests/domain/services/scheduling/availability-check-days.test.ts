import { parseCalendarDay, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  groupCheckDays,
  isShiftAnswerable,
} from '@/domain/services/scheduling/availability-check-days';

const TIME_ZONE = 'America/Sao_Paulo';
const NOW = parseInstant({ value: '2026-09-10T15:00:00.000Z' });
const instant = (value: string) => parseInstant({ value });
const day = (value: string) => parseCalendarDay({ value });

interface ShiftOptions {
  id: string;
  start: string;
  end: string;
  published?: boolean;
}

const shift = ({ id, start, end, published = false }: ShiftOptions) => ({
  id,
  published,
  startTime: instant(start),
  endTime: instant(end),
});

describe('isShiftAnswerable', () => {
  const open = shift({
    id: 'open',
    start: '2026-09-10T16:00:00.000Z',
    end: '2026-09-10T18:00:00.000Z',
  });

  it('answers an unpublished Shift that has not ended in an open check', () => {
    expect(isShiftAnswerable({ readOnly: false, shift: open, now: NOW })).toBe(
      true,
    );
  });

  it('locks a read-only check, a published Shift and a Shift ending exactly now', () => {
    expect(isShiftAnswerable({ readOnly: true, shift: open, now: NOW })).toBe(
      false,
    );
    expect(
      isShiftAnswerable({
        readOnly: false,
        shift: { ...open, published: true },
        now: NOW,
      }),
    ).toBe(false);
    expect(
      isShiftAnswerable({
        readOnly: false,
        shift: { ...open, endTime: NOW },
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe('groupCheckDays', () => {
  it('groups by Church-local start day in order and states each day', () => {
    const shifts = [
      // 2026-09-08: both ended, one of them published.
      shift({
        id: 'past-a',
        start: '2026-09-08T12:00:00.000Z',
        end: '2026-09-08T14:00:00.000Z',
      }),
      shift({
        id: 'past-b',
        start: '2026-09-08T18:00:00.000Z',
        end: '2026-09-08T20:00:00.000Z',
        published: true,
      }),
      // 2026-09-10: one ended, one still ahead and answerable.
      shift({
        id: 'open-ended',
        start: '2026-09-10T11:00:00.000Z',
        end: '2026-09-10T13:00:00.000Z',
      }),
      shift({
        id: 'open-ahead',
        start: '2026-09-10T16:00:00.000Z',
        end: '2026-09-10T18:00:00.000Z',
      }),
      // 2026-09-12: still ahead but published.
      shift({
        id: 'published',
        start: '2026-09-12T12:00:00.000Z',
        end: '2026-09-12T14:00:00.000Z',
        published: true,
      }),
    ];

    const { days, counts } = groupCheckDays({
      readOnly: false,
      shifts,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(
      days.map((entry) => ({
        date: entry.date,
        state: entry.state,
        shifts: entry.shifts.map(({ id, answerable }) => ({ id, answerable })),
      })),
    ).toEqual([
      {
        date: day('2026-09-08'),
        state: 'past',
        shifts: [
          { id: 'past-a', answerable: false },
          { id: 'past-b', answerable: false },
        ],
      },
      {
        date: day('2026-09-10'),
        state: 'open',
        shifts: [
          { id: 'open-ended', answerable: false },
          { id: 'open-ahead', answerable: true },
        ],
      },
      {
        date: day('2026-09-12'),
        state: 'published',
        shifts: [{ id: 'published', answerable: false }],
      },
    ]);
    expect(counts).toEqual({
      openDays: 1,
      pastDays: 1,
      publishedDays: 1,
      openShifts: 1,
    });
  });

  it('puts a late-evening Shift on its Church-local day, not its UTC day', () => {
    // 01:00Z on 2026-09-11 is 22:00 on 2026-09-10 in São Paulo (UTC-3).
    const { days } = groupCheckDays({
      readOnly: false,
      shifts: [
        shift({
          id: 'late',
          start: '2026-09-11T01:00:00.000Z',
          end: '2026-09-11T02:00:00.000Z',
        }),
        shift({
          id: 'next-morning',
          start: '2026-09-11T03:00:00.000Z',
          end: '2026-09-11T04:00:00.000Z',
        }),
      ],
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(
      days.map((entry) => [entry.date, entry.shifts.map(({ id }) => id)]),
    ).toEqual([
      [day('2026-09-10'), ['late']],
      [day('2026-09-11'), ['next-morning']],
    ]);
  });

  it('shows a read-only check’s unended days as published, with nothing open', () => {
    const { days, counts } = groupCheckDays({
      readOnly: true,
      shifts: [
        shift({
          id: 'ahead',
          start: '2026-09-12T12:00:00.000Z',
          end: '2026-09-12T14:00:00.000Z',
        }),
      ],
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(days.map((entry) => entry.state)).toEqual(['published']);
    expect(counts).toEqual({
      openDays: 0,
      pastDays: 0,
      publishedDays: 1,
      openShifts: 0,
    });
  });
});
