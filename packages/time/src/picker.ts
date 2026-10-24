import { enUS } from 'date-fns/locale/en-US';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CalendarDay } from './brands';
import { capitalize } from './capitalize';
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

export interface PickerFormatters {
  formatMonthDropdown: (date: Date) => string;
}

export interface PickerLocaleResult {
  locale: typeof enUS | typeof ptBR;
  formatters: PickerFormatters;
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
    formatters: {
      formatMonthDropdown: (date: Date) => capitalize(fmt.format(date)),
    },
  };
}
