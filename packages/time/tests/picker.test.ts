import { describe, expect, it } from 'vitest';
import {
  fromPickerDate,
  parseCalendarDay,
  pickerLocale,
  toPickerDate,
} from '../src';

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

describe('pickerLocale', () => {
  it('returns January as "Janeiro" for pt-BR', () => {
    const result = pickerLocale({ locale: 'pt-BR' });
    // January 2027 — using UTC date so the ambient TZ never shifts the month.
    const jan = new Date(Date.UTC(2027, 0, 1));
    expect(result.formatters.formatMonthDropdown(jan)).toBe('Janeiro');
  });

  it('returns July as "Julho" for pt-BR', () => {
    const result = pickerLocale({ locale: 'pt-BR' });
    const jul = new Date(Date.UTC(2027, 6, 1));
    expect(result.formatters.formatMonthDropdown(jul)).toBe('Julho');
  });

  it('returns January as "January" for en', () => {
    const result = pickerLocale({ locale: 'en' });
    const jan = new Date(Date.UTC(2027, 0, 1));
    expect(result.formatters.formatMonthDropdown(jan)).toBe('January');
  });

  it('returns the date-fns ptBR locale object for pt-BR', () => {
    const result = pickerLocale({ locale: 'pt-BR' });
    // Verify it's a Locale object with the right locale code.
    expect(result.locale.code).toBe('pt-BR');
  });

  it('returns the date-fns enUS locale object for en', () => {
    const result = pickerLocale({ locale: 'en' });
    expect(result.locale.code).toBe('en-US');
  });
});
