import { m } from '@church/i18n/messages';
import { expect, type Page } from '@playwright/test';
import { fillDatePickerField } from './date-picker.helpers';
import { fillTimeOfDayField } from './time-field.helpers';

const LOCALE = { locale: 'pt-BR' } as const;

export interface AddEventOnNestedPageInput {
  page: Page;
  title: string;
  /** Church-local start day, `yyyy-MM-dd`; the time keeps its 19:00 default. */
  startDate: string;
  /** Church-local end day; defaults to the start day. */
  endDate?: string;
  /** Church-local end time, `HH:mm`; defaults to 21:00. */
  endTime?: string;
}

/** From a Draft Cycle's review, saves a one-row Event on the nested New Event
 * page; resolves once the review is back with the saved Event revealed. */
export async function addEventOnNestedPage({
  page,
  title,
  startDate,
  endDate = startDate,
  endTime,
}: AddEventOnNestedPageInput): Promise<void> {
  await page
    .getByRole('link', { name: m.cycles_add_event_button({}, LOCALE) })
    .click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/events\/new$/);

  await page.getByLabel(m.event_editor_title_label({}, LOCALE)).fill(title);
  await fillDatePickerField({
    page,
    trigger: page.getByTestId('event-start-date'),
    date: startDate,
  });
  await fillDatePickerField({
    page,
    trigger: page.getByTestId('event-end-date'),
    date: endDate,
  });
  if (endTime) {
    await fillTimeOfDayField({
      field: page.getByTestId('event-end-time'),
      time: endTime,
    });
  }
  await page
    .getByRole('button', { name: m.event_editor_create_submit({}, LOCALE) })
    .click();

  await expect(page).toHaveURL(/\/cycles\/[^/]+\?eventId=/);
}
