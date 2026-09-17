import { describe, expect, it } from 'vitest';
import { fromPickerDate, parseCalendarDay, toPickerDate } from '../src';

const day = (value: string) => parseCalendarDay({ value });

describe('picker bridge', () => {
  it('hands a date widget a local-midnight Date for the CalendarDay', () => {
    const date = toPickerDate({ day: day('2027-01-04') });
    expect(date.getFullYear()).toBe(2027);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(4);
    expect(date.getHours()).toBe(0);
  });

  it('reads the widget Date back as the same CalendarDay in any ambient zone', () => {
    for (const value of ['2027-01-04', '2028-02-29', '2027-12-31']) {
      expect(fromPickerDate({ date: toPickerDate({ day: day(value) }) })).toBe(
        value,
      );
    }
  });
});
