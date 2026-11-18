import type { Locator, Page } from '@playwright/test';

// App defaults to pt-BR (appConfig.defaultLocale); these names match that locale.
const WEEKDAY_NAMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

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
  const dayLabel = `${weekday}, ${day} de ${MONTH_FULL_NAMES[month - 1]} de ${year}`;

  await trigger.click();

  const popover = page.locator('[data-slot="popover-content"]');
  await popover
    .getByRole('combobox', { name: 'Choose the Month' })
    .selectOption({ value: String(month - 1) });
  await popover
    .getByRole('combobox', { name: 'Choose the Year' })
    .selectOption({ label: String(year) });
  await popover
    .getByRole('button', { name: new RegExp(`${dayLabel}$`) })
    .click();
}
