import { describe, expect, it } from 'vitest';
import {
  compareRegularActivities,
  exceptOrdinals,
} from '@/domain/programme-order';
import type { Recurrence } from '@/domain/recurrence';

const weekly = (...weekdays: number[]) =>
  ({ kind: 'weekly', weekdays }) as Recurrence;
const nth = (ordinal: 1 | 2 | 3 | 'last', weekday: number) =>
  ({ kind: 'nthWeekday', ordinal, weekday }) as never;
const monthly = (...entries: unknown[]) =>
  ({ kind: 'monthly', entries }) as Recurrence;

function order(
  activities: { name: string; recurrence: Recurrence; startTime: string }[],
) {
  return [...activities]
    .sort((left, right) => compareRegularActivities({ left, right }))
    .map(({ name }) => name);
}

describe('compareRegularActivities', () => {
  it('puts weekday activities Sunday-first, then by time', () => {
    expect(
      order([
        { name: 'wed', recurrence: weekly(3), startTime: '19:00' },
        { name: 'sun late', recurrence: weekly(0), startTime: '19:00' },
        { name: 'sun early', recurrence: weekly(0), startTime: '09:00' },
      ]),
    ).toEqual(['sun early', 'sun late', 'wed']);
  });

  it('puts weekly before monthly on the same weekday and time', () => {
    expect(
      order([
        { name: 'monthly', recurrence: monthly(nth(1, 0)), startTime: '09:00' },
        { name: 'weekly', recurrence: weekly(0), startTime: '09:00' },
      ]),
    ).toEqual(['weekly', 'monthly']);
  });

  it('puts day-of-month activities after weekday ones, by day then time', () => {
    expect(
      order([
        {
          name: 'day 15 late',
          recurrence: monthly({ kind: 'dayOfMonth', day: 15 }),
          startTime: '20:00',
        },
        {
          name: 'last day',
          recurrence: monthly({ kind: 'lastDayOfMonth' }),
          startTime: '08:00',
        },
        {
          name: 'day 15 early',
          recurrence: monthly({ kind: 'dayOfMonth', day: 15 }),
          startTime: '07:00',
        },
        {
          name: 'day 2',
          recurrence: monthly({ kind: 'dayOfMonth', day: 2 }),
          startTime: '22:00',
        },
        { name: 'sat', recurrence: weekly(6), startTime: '23:00' },
      ]),
    ).toEqual(['sat', 'day 2', 'day 15 early', 'day 15 late', 'last day']);
  });

  it('places a mixed Recurrence by its first entry', () => {
    expect(
      order([
        { name: 'sat', recurrence: weekly(6), startTime: '09:00' },
        {
          name: 'mixed day first',
          recurrence: monthly({ kind: 'dayOfMonth', day: 1 }, nth(1, 0)),
          startTime: '09:00',
        },
        {
          name: 'mixed weekday first',
          recurrence: monthly(nth('last', 5), { kind: 'dayOfMonth', day: 1 }),
          startTime: '09:00',
        },
      ]),
    ).toEqual(['mixed weekday first', 'sat', 'mixed day first']);
  });
});

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
