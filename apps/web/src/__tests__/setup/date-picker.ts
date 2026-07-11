import { screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

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

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const ORDINAL_SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${ORDINAL_SUFFIXES[day % 10] ?? 'th'}`;
}

interface PickCalendarDateInput {
  user: UserEvent;
  trigger: HTMLElement;
  /** Date value as `yyyy-MM-dd`, matching `DatePickerField`'s own storage format. */
  date: string;
}

/** Drives the shadcn Calendar+Popover `DatePickerField` (`src/components/date-picker-field.tsx`)
 * like a user: open the trigger, jump to the target month/year via the calendar's dropdown nav,
 * click the day cell. */
export async function pickCalendarDate({
  user,
  trigger,
  date,
}: PickCalendarDateInput): Promise<void> {
  const [year, month, day] = date.split('-').map(Number);
  const weekday =
    WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const dayLabel = `${weekday}, ${MONTH_FULL_NAMES[month - 1]} ${ordinal(day)}, ${year}`;

  await user.click(trigger);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Choose the Month' }),
    MONTH_SHORT_NAMES[month - 1],
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Choose the Year' }),
    String(year),
  );
  await user.click(
    screen.getByRole('button', { name: new RegExp(`${dayLabel}$`) }),
  );
  await waitFor(() => {
    expect(
      screen.queryByRole('combobox', { name: 'Choose the Month' }),
    ).not.toBeInTheDocument();
  });
}
