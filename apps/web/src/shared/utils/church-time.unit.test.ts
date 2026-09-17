import { describe, expect, it } from 'vitest';
import {
  dayOf,
  formatCalendarDateOnly,
  formatDayOf,
  formatInstantOf,
  formatInstantRangeOf,
} from './church-time';

const SAO_PAULO = 'America/Sao_Paulo';
// 23:30 on 4 Jan in São Paulo is already 5 Jan in UTC (and in most viewers' zones).
const LATE_EVENING = '2027-01-05T02:30:00.000Z';

describe('church-time', () => {
  it('reads the CalendarDay of an API instant through the Church Timezone', () => {
    expect(dayOf({ value: LATE_EVENING, timeZone: SAO_PAULO })).toBe(
      '2027-01-04',
    );
    expect(dayOf({ value: LATE_EVENING, timeZone: 'UTC' })).toBe('2027-01-05');
  });

  it('formats the day as dd/MM/yyyy', () => {
    expect(formatDayOf({ value: LATE_EVENING, timeZone: SAO_PAULO })).toBe(
      '04/01/2027',
    );
  });

  it('formats a date-only value (a planning-cycle bound) as dd/MM/yyyy, ignoring any ambient TZ', () => {
    expect(formatCalendarDateOnly({ value: '2027-01-04' })).toBe('04/01/2027');
    expect(formatCalendarDateOnly({ value: '2027-01-04T00:00:00.000Z' })).toBe(
      '04/01/2027',
    );
  });

  it('formats an instant as dd/MM/yyyy HH:mm in the Church Timezone', () => {
    expect(formatInstantOf({ value: LATE_EVENING, timeZone: SAO_PAULO })).toBe(
      '04/01/2027 23:30',
    );
  });

  it('formats a window once per day: the end drops its date when it shares the start day', () => {
    expect(
      formatInstantRangeOf({
        start: '2027-01-04T12:00:00.000Z',
        end: '2027-01-04T21:00:00.000Z',
        timeZone: SAO_PAULO,
      }),
    ).toBe('04/01/2027 09:00 – 18:00');
    expect(
      formatInstantRangeOf({
        start: '2027-01-04T12:00:00.000Z',
        end: LATE_EVENING,
        timeZone: 'UTC',
      }),
    ).toBe('04/01/2027 12:00 – 05/01/2027 02:30');
  });
});
