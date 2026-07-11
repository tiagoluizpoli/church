import type { Locator, Page } from '@playwright/test';

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const ORDINAL_SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${ORDINAL_SUFFIXES[day % 10] ?? 'th'}`;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_FULL_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface FillDatePickerFieldInput {
  page: Page;
  trigger: Locator;
  /** Date value as `yyyy-MM-dd`, matching the field's own storage format. */
  date: string;
}

/** Drives the shadcn Calendar+Popover `DatePickerField` (`src/components/date-picker-field.tsx`)
 * like a user: open the trigger, jump to the target month/year via the calendar's dropdown nav,
 * click the day cell. */
export async function fillDatePickerField({
  page,
  trigger,
  date,
}: FillDatePickerFieldInput): Promise<void> {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAY_NAMES[target.getUTCDay()];
  const dayLabel = `${weekday}, ${MONTH_FULL_NAMES[month - 1]} ${ordinal(day)}, ${year}`;

  await trigger.click();

  const popover = page.locator('[data-slot="popover-content"]');
  await popover
    .getByRole('combobox', { name: 'Choose the Month' })
    .selectOption({ label: MONTH_SHORT_NAMES[month - 1] });
  await popover
    .getByRole('combobox', { name: 'Choose the Year' })
    .selectOption({ label: String(year) });
  await popover
    .getByRole('button', { name: new RegExp(`${dayLabel}$`) })
    .click();
}
