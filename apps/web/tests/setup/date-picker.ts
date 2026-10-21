import { screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';

// Tests render in pt-BR (see tests/setup/locale.ts); these names match that locale.
const MONTH_FULL_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const WEEKDAY_NAMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

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
  const dayLabel = `${weekday}, ${day} de ${MONTH_FULL_NAMES[month - 1]} de ${year}`;

  await user.click(trigger);
  // Select by the option's value (0-based month index) to avoid locale text matching.
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Choose the Month' }),
    String(month - 1),
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
