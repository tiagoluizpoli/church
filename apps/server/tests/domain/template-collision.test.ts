import { describe, expect, it } from 'vitest';
import type { Recurrence } from '@/domain/recurrence';
import {
  type CollisionShape,
  templatesCollide,
} from '@/domain/template-collision';

const sundays: Recurrence = { kind: 'weekly', weekdays: [0] };
const firstSunday: Recurrence = {
  kind: 'monthly',
  entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
};

function shape(
  recurrence: Recurrence,
  ...times: [string, string][]
): CollisionShape {
  return {
    recurrence,
    blocks: times.map(([startTime, endTime]) => ({ startTime, endTime })),
  };
}

const saturdays: Recurrence = { kind: 'weekly', weekdays: [6] };

describe('templatesCollide', () => {
  it('collides when a block crossing midnight overlaps the other template on the next day', () => {
    const overnight = shape(saturdays, ['22:00', '01:00']);
    const earlySunday = shape(sundays, ['00:30', '02:00']);

    expect(templatesCollide({ left: overnight, right: earlySunday })).toBe(
      true,
    );
    expect(templatesCollide({ left: earlySunday, right: overnight })).toBe(
      true,
    );
    // The 1st Sunday's Saturday may sit in the previous month.
    expect(
      templatesCollide({
        left: overnight,
        right: shape(firstSunday, ['00:30', '02:00']),
      }),
    ).toBe(true);
  });

  it("does not collide when the overnight block ends before the next day's block", () => {
    expect(
      templatesCollide({
        left: shape(saturdays, ['22:00', '00:30']),
        right: shape(sundays, ['00:30', '02:00']),
      }),
    ).toBe(false);
  });

  it('collides on a shared day when blocks overlap', () => {
    expect(
      templatesCollide({
        left: shape(sundays, ['09:00', '10:00']),
        right: shape(firstSunday, ['09:30', '11:00']),
      }),
    ).toBe(true);
  });

  it('does not collide when no day is shared, even with identical blocks', () => {
    expect(
      templatesCollide({
        left: shape(sundays, ['09:00', '10:00']),
        right: shape({ kind: 'weekly', weekdays: [1, 6] }, ['09:00', '10:00']),
      }),
    ).toBe(false);
  });

  it('does not collide when blocks merely touch', () => {
    expect(
      templatesCollide({
        left: shape(sundays, ['18:00', '19:00']),
        right: shape(sundays, ['19:00', '20:00'], ['07:00', '18:00']),
      }),
    ).toBe(false);
  });

  it('collides when any one pair of blocks overlaps', () => {
    expect(
      templatesCollide({
        left: shape(sundays, ['07:00', '08:00'], ['18:00', '19:30']),
        right: shape(sundays, ['19:00', '20:00']),
      }),
    ).toBe(true);
  });

  it('resolves a block crossing midnight past the end of the day', () => {
    expect(
      templatesCollide({
        left: shape(sundays, ['22:00', '01:00']),
        right: shape(sundays, ['23:00', '23:30']),
      }),
    ).toBe(true);
    // 22:00–01:00 ends after midnight; an early block the same day is not inside it.
    expect(
      templatesCollide({
        left: shape(sundays, ['22:00', '01:00']),
        right: shape(sundays, ['00:30', '02:00']),
      }),
    ).toBe(false);
    expect(
      templatesCollide({
        left: shape(sundays, ['22:00', '01:00']),
        right: shape(sundays, ['21:00', '22:00']),
      }),
    ).toBe(false);
  });

  it.each<[string, Recurrence, Recurrence, boolean]>([
    [
      'weekly × weekly',
      { kind: 'weekly', weekdays: [2, 4] },
      { kind: 'weekly', weekdays: [4] },
      true,
    ],
    [
      'weekly × nth weekday',
      { kind: 'weekly', weekdays: [5] },
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 5 }],
      },
      true,
    ],
    [
      'weekly × nth weekday on another weekday',
      { kind: 'weekly', weekdays: [5] },
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 2, weekday: 4 }],
      },
      false,
    ],
    [
      'weekly × day of month',
      { kind: 'weekly', weekdays: [3] },
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 15 }] },
      true,
    ],
    [
      'weekly × last day of month',
      { kind: 'weekly', weekdays: [1] },
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      true,
    ],
    [
      'nth weekday × nth weekday',
      firstSunday,
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 2, weekday: 0 }],
      },
      false,
    ],
    [
      '1st weekday × day of month 1–7',
      firstSunday,
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 7 }] },
      true,
    ],
    [
      '1st weekday × day of month 8',
      firstSunday,
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 8 }] },
      false,
    ],
    [
      '5th weekday × last weekday',
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 5, weekday: 6 }],
      },
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 6 }],
      },
      true,
    ],
    [
      '4th weekday × last weekday',
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 4, weekday: 6 }],
      },
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 6 }],
      },
      true,
    ],
    [
      'nth weekday × last day of month',
      {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 2 }],
      },
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      true,
    ],
    [
      '1st weekday × last day of month',
      firstSunday,
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      false,
    ],
    [
      'day of month × day of month',
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 15 }] },
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 16 }] },
      false,
    ],
    [
      'day 29 × last day of month (leap February)',
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 29 }] },
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      true,
    ],
    [
      'day 31 × last day of month',
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 31 }] },
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      true,
    ],
    [
      'day 27 × last day of month',
      { kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 27 }] },
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      false,
    ],
    [
      'last day × last day of month',
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      { kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] },
      true,
    ],
  ])('judges %s on whether they can share a day', (_case, left, right, expected) => {
    const block: [string, string] = ['09:00', '10:00'];
    expect(
      templatesCollide({
        left: shape(left, block),
        right: shape(right, block),
      }),
    ).toBe(expected);
    expect(
      templatesCollide({
        left: shape(right, block),
        right: shape(left, block),
      }),
    ).toBe(expected);
  });
});
