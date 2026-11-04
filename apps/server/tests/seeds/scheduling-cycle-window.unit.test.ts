import { appConfig } from '@church/app-config';
import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
  weekdayIndex,
} from '@church/time';
import { describe, expect, it } from 'vitest';
import { cycleWindow } from '@/seeds/e2e/recipes/scheduling-cycle-window';

const SUNDAY = 0;
const INCLUDED_DAYS = 28;
const SUNDAYS_IN_FOUR_WEEKS = 4;
/** 2026-10-04 is a Sunday; the next seven days cover every weekday. */
const WEEK_ANCHORS = Array.from({ length: 7 }, (_, offset) =>
  addCalendarDays({
    day: parseCalendarDay({ value: '2026-10-04' }),
    days: offset,
  }),
);

interface DayInput {
  day: CalendarDay;
}

/** Every day from startDate through endDate, both included. */
function includedDays({ day }: DayInput): CalendarDay[] {
  const { startDate, endDate } = cycleWindow({ anchor: day });
  const days: CalendarDay[] = [];
  for (
    let cursor = startDate;
    cursor <= endDate;
    cursor = addCalendarDays({ day: cursor, days: 1 })
  ) {
    days.push(cursor);
  }
  return days;
}

function sundaysIn({ day }: DayInput): CalendarDay[] {
  return includedDays({ day }).filter(
    (candidate) => weekdayIndex({ day: candidate }) === SUNDAY,
  );
}

interface DaysBetweenInput {
  from: CalendarDay;
  to: CalendarDay;
}

function daysBetween({ from, to }: DaysBetweenInput): number {
  let days = 0;
  while (addCalendarDays({ day: from, days }) !== to) days += 1;
  return days;
}

describe('cycleWindow', () => {
  it.each(
    WEEK_ANCHORS.map((day) => ({ day })),
  )('puts the first Sunday beyond the cancel lead time for anchor $day', ({
    day,
  }) => {
    const sundays = sundaysIn({ day });
    const first = sundays[0];
    if (first === undefined) throw new Error('window holds no Sunday');
    const { cancelLeadTimeDays } = appConfig.assignment;
    const daysToFirstSunday = daysBetween({ from: day, to: first });
    expect(daysToFirstSunday).toBeGreaterThan(cancelLeadTimeDays);
    expect(sundays).toHaveLength(SUNDAYS_IN_FOUR_WEEKS);
  });

  it.each(
    WEEK_ANCHORS.map((day) => ({ day })),
  )('includes exactly 28 days, its last day being endDate, for anchor $day', ({
    day,
  }) => {
    expect(includedDays({ day })).toHaveLength(INCLUDED_DAYS);
  });

  it('covers all seven weekdays', () => {
    expect(new Set(WEEK_ANCHORS.map((day) => weekdayIndex({ day }))).size).toBe(
      7,
    );
  });
});
