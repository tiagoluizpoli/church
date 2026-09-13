import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, parseCalendarDay } from '../src';

const day = (value: string) => parseCalendarDay({ value });

describe('calendarDaysBetween', () => {
  it('counts whole CalendarDays, signed', () => {
    expect(
      calendarDaysBetween({ start: day('2027-01-04'), end: day('2027-01-04') }),
    ).toBe(0);
    expect(
      calendarDaysBetween({ start: day('2027-01-04'), end: day('2027-02-08') }),
    ).toBe(35);
    expect(
      calendarDaysBetween({ start: day('2027-02-08'), end: day('2027-01-04') }),
    ).toBe(-35);
  });

  it('is unaffected by DST and leap days', () => {
    expect(
      calendarDaysBetween({ start: day('2028-02-28'), end: day('2028-03-01') }),
    ).toBe(2);
    expect(
      calendarDaysBetween({ start: day('2027-03-13'), end: day('2027-03-15') }),
    ).toBe(2);
  });
});
