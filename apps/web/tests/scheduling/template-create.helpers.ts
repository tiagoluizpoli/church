import { expect, type Page } from '@playwright/test';
import { fillTimeOfDayField } from './time-field.helpers';

interface TemplateBlockInput {
  label: string;
  startTime: string;
  endTime: string;
}

export interface CreateTemplateOnNestedPageInput {
  page: Page;
  name: string;
  /** 0 (Sunday) … 6 (Saturday). */
  weekday: number;
  blocks: TemplateBlockInput[];
}

/** From the template list, fills the nested create page and saves; resolves on the refreshed list. */
export async function createTemplateOnNestedPage({
  page,
  name,
  weekday,
  blocks,
}: CreateTemplateOnNestedPageInput): Promise<void> {
  await page.getByTestId('new-template-button').click();
  await expect(page).toHaveURL(/\/event-templates\/new$/);

  await page.getByTestId('template-name-input').fill(name);
  await page.getByTestId('template-weekday-select').click();
  await page.getByTestId(`template-weekday-option-${weekday}`).click();

  for (const [index, block] of blocks.entries()) {
    if (index > 0) {
      await page.getByTestId('add-template-time-block-button').click();
    }
    const row = page.getByTestId('template-time-block-row').nth(index);
    await row.getByTestId('template-time-block-label-input').fill(block.label);
    await fillTimeOfDayField({
      field: row.getByTestId('template-time-block-start-time-input'),
      time: block.startTime,
    });
    await fillTimeOfDayField({
      field: row.getByTestId('template-time-block-end-time-input'),
      time: block.endTime,
    });
  }

  await page.getByTestId('create-template-button').click();
  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(
    page.getByTestId('saved-template-row').filter({ hasText: name }),
  ).toBeAttached(); // the card list is hidden at desktop widths
}
