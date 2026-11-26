import { describe, expect, it } from 'vitest';
import { exceptOrdinals } from '@/domain/programme-order';
import type { Recurrence } from '@/domain/recurrence';

const weekly = (...weekdays: number[]) =>
  ({ kind: 'weekly', weekdays }) as Recurrence;
const nth = (ordinal: 1 | 2 | 3 | 'last', weekday: number) =>
  ({ kind: 'nthWeekday', ordinal, weekday }) as never;
const monthly = (...entries: unknown[]) =>
  ({ kind: 'monthly', entries }) as Recurrence;

describe('exceptOrdinals', () => {
  it('lists the nth weekdays of winners on a weekday the weekly activity runs', () => {
    expect(
      exceptOrdinals({
        recurrence: weekly(0),
        winners: [monthly(nth(3, 0), nth(1, 0), nth('last', 6))],
      }),
    ).toEqual([1, 3]);
  });

  it('ignores day-of-month winners, other weekdays and monthly activities', () => {
    expect(
      exceptOrdinals({
        recurrence: weekly(0),
        winners: [monthly({ kind: 'dayOfMonth', day: 15 }, nth(1, 3))],
      }),
    ).toEqual([]);
    expect(
      exceptOrdinals({
        recurrence: monthly(nth(2, 0)),
        winners: [monthly(nth(1, 0))],
      }),
    ).toEqual([]);
  });

  it('lists each ordinal once, last after the numbered ones', () => {
    expect(
      exceptOrdinals({
        recurrence: weekly(0),
        winners: [
          monthly(nth('last', 0)),
          monthly(nth(1, 0)),
          monthly(nth(1, 0)),
        ],
      }),
    ).toEqual([1, 'last']);
  });
});
