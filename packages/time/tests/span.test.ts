import { describe, expect, it } from 'vitest';
import {
  type Instant,
  instantSpan,
  parseInstant,
  parseTimeOfDay,
  type TimeOfDay,
  timeOfDaySpan,
} from '../src';

function instant(value: string): Instant {
  return parseInstant({ value });
}

function timeOfDay(value: string): TimeOfDay {
  return parseTimeOfDay({ value });
}

describe('timeOfDaySpan', () => {
  it('covers a same-day span', () => {
    expect(
      timeOfDaySpan({ start: timeOfDay('09:00'), end: timeOfDay('10:30') }),
    ).toEqual({ durationMinutes: 90, crossesToNextDay: false });
  });

  it('covers a span crossing midnight', () => {
    expect(
      timeOfDaySpan({ start: timeOfDay('23:00'), end: timeOfDay('01:00') }),
    ).toEqual({ durationMinutes: 120, crossesToNextDay: true });
  });

  it('covers equal start and end', () => {
    expect(
      timeOfDaySpan({ start: timeOfDay('09:00'), end: timeOfDay('09:00') }),
    ).toEqual({ durationMinutes: 0, crossesToNextDay: false });
  });
});

describe('instantSpan', () => {
  it('covers a same-day span', () => {
    expect(
      instantSpan({
        start: instant('2027-01-04T13:00:00.000Z'),
        end: instant('2027-01-04T17:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toEqual({ durationMinutes: 240, crossesToNextDay: false });
  });

  it('covers a span crossing onto the next CalendarDay in the Church Timezone', () => {
    expect(
      instantSpan({
        start: instant('2027-01-04T23:00:00.000Z'),
        end: instant('2027-01-05T01:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toEqual({ durationMinutes: 120, crossesToNextDay: true });
  });

  it('covers equal start and end', () => {
    const at = instant('2027-01-04T13:00:00.000Z');
    expect(instantSpan({ start: at, end: at, timeZone: 'UTC' })).toEqual({
      durationMinutes: 0,
      crossesToNextDay: false,
    });
  });
});
