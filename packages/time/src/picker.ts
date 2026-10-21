import { enUS, ptBR } from 'date-fns/locale';
import type { CalendarDay } from './brands';
import type { Locale } from './display';

/**
 * Bridge for date-picker widgets (react-day-picker) that model a day as a
 * `Date` at local midnight. The Date never leaves the widget: a CalendarDay
 * goes in and a CalendarDay comes out, so the ambient zone cancels out.
 */
export interface ToPickerDateInput {
  day: CalendarDay;
}

export function toPickerDate({ day }: ToPickerDateInput): Date {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, dayOfMonth ?? 1);
}

export interface FromPickerDateInput {
  date: Date;
}

export function fromPickerDate({ date }: FromPickerDateInput): CalendarDay {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}` as CalendarDay;
}

const DATEFNS_LOCALE = { en: enUS, 'pt-BR': ptBR } as const;

export interface PickerLocaleInput {
  locale: Locale;
}

export interface PickerLocaleResult {
  locale: typeof enUS | typeof ptBR;
  formatters: {
    formatMonthDropdown: (date: Date) => string;
  };
}

/** Locale and month-dropdown formatter for react-day-picker, keyed by the seam's Locale. */
export function pickerLocale({
  locale,
}: PickerLocaleInput): PickerLocaleResult {
  const fmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  return {
    locale: DATEFNS_LOCALE[locale],
    formatters: { formatMonthDropdown: (date: Date) => fmt.format(date) },
  };
}
