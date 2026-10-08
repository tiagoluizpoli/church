import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
  weekdayIndex,
} from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CANCEL_LEAD_TIME_DAYS,
  planningCycleWindow,
} from '../../seeds/e2e/recipes/scheduling-cycle-window';

const SUNDAY = 0;
const WINDOW_SPAN_DAYS = 29;
const MIN_SUNDAYS = 4;
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

function sundaysIn({ day }: DayInput): CalendarDay[] {
  const { startDate } = planningCycleWindow({ anchor: day });
  return Array.from({ length: WINDOW_SPAN_DAYS }, (_, offset) =>
    addCalendarDays({ day: startDate, days: offset }),
  ).filter((candidate) => weekdayIndex({ day: candidate }) === SUNDAY);
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

describe('planningCycleWindow', () => {
  it.each(
    WEEK_ANCHORS.map((day) => ({ day })),
  )('puts the first Sunday beyond the cancel lead time for anchor $day', ({
    day,
  }) => {
    const sundays = sundaysIn({ day });
    const first = sundays[0];
    if (first === undefined) throw new Error('window holds no Sunday');
    expect(daysBetween({ from: day, to: first })).toBeGreaterThan(
      DEFAULT_CANCEL_LEAD_TIME_DAYS,
    );
    expect(sundays.length).toBeGreaterThanOrEqual(MIN_SUNDAYS);
  });

  it('covers all seven weekdays', () => {
    expect(new Set(WEEK_ANCHORS.map((day) => weekdayIndex({ day }))).size).toBe(
      7,
    );
  });
});
