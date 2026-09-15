import {
  addCalendarDays,
  type Instant,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
  toInstant,
} from '@church/time';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatLastServed } from './format-last-served';

const SAO_PAULO = 'America/Sao_Paulo';
// 09:00 on 13 Sep 2026 in São Paulo.
const NOW = parseInstant({ value: '2026-09-13T12:00:00.000Z' });

function servedDaysAgo(days: number): Instant {
  return toInstant({
    day: addCalendarDays({
      day: parseCalendarDay({ value: '2026-09-13' }),
      days: -days,
    }),
    time: parseTimeOfDay({ value: '08:00' }),
    timeZone: SAO_PAULO,
  });
}

function lastServed(days: number): string {
  return formatLastServed({
    lastServedAt: servedDaysAgo(days),
    timeZone: SAO_PAULO,
  });
}

describe('formatLastServed', () => {
  beforeEach(() => setTestClock({ instant: NOW }));
  afterEach(() => resetClock());

  it('reports a volunteer who has never served', () => {
    expect(formatLastServed({ timeZone: SAO_PAULO })).toBe('never served');
  });

  it('treats an unparseable date as never served', () => {
    expect(
      formatLastServed({ lastServedAt: 'not-a-date', timeZone: SAO_PAULO }),
    ).toBe('never served');
  });

  it('names today and yesterday rather than counting them', () => {
    expect(lastServed(0)).toBe('last served today');
    expect(lastServed(1)).toBe('last served yesterday');
  });

  it('counts calendar days in the Church Timezone, not UTC', () => {
    // 22:00 on 12 Sep in São Paulo is already 13 Sep in UTC.
    const lateEvening = '2026-09-13T01:00:00.000Z';
    expect(
      formatLastServed({ lastServedAt: lateEvening, timeZone: SAO_PAULO }),
    ).toBe('last served yesterday');
    expect(
      formatLastServed({ lastServedAt: lateEvening, timeZone: 'UTC' }),
    ).toBe('last served today');
  });

  it('counts days inside the first week', () => {
    expect(lastServed(6)).toBe('last served 6 days ago');
  });

  it('counts whole weeks once a week has passed', () => {
    expect(lastServed(7)).toBe('last served 1 week ago');
    expect(lastServed(35)).toBe('last served 5 weeks ago');
    expect(lastServed(41)).toBe('last served 5 weeks ago');
  });

  it('switches to months past eight weeks, where weeks stop being useful', () => {
    expect(lastServed(56)).toBe('last served 8 weeks ago');
    expect(lastServed(57)).toBe('last served 1 month ago');
    expect(lastServed(120)).toBe('last served 4 months ago');
  });

  it('clamps a future date to today rather than reporting negative time', () => {
    expect(lastServed(-3)).toBe('last served today');
  });
});
