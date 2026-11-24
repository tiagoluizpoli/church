import { expect, type Page } from '@playwright/test';
import { fillTimeOfDayField } from './time-field.helpers';

interface TemplateBlockInput {
  label: string;
  startTime: string;
  endTime: string;
}

export interface CreateTemplateInDialogInput {
  page: Page;
  name: string;
  /** 0 (Sunday) … 6 (Saturday). */
  weekday: number;
  blocks: TemplateBlockInput[];
}

/** From the template list, fills the create dialog over it and saves; resolves on the refreshed list. */
export async function createTemplateInDialog({
  page,
  name,
  weekday,
  blocks,
}: CreateTemplateInDialogInput): Promise<void> {
  await page.getByTestId('new-template-button').click();
  await expect(page).toHaveURL(/\/event-templates\/new$/);
  const dialog = page.getByTestId('template-create-dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByTestId('template-name-input').fill(name);
  // A new template starts weekly on Sunday (0); pick the weekday, then drop Sunday.
  if (weekday !== 0) {
    await dialog.getByTestId(`template-weekday-toggle-${weekday}`).click();
    await dialog.getByTestId('template-weekday-toggle-0').click();
  }

  for (const [index, block] of blocks.entries()) {
    if (index > 0) {
      await dialog.getByTestId('add-template-time-block-button').click();
    }
    const row = dialog.getByTestId('template-time-block-row').nth(index);
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

  await dialog.getByTestId('create-template-button').click();
  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId('saved-template-row').filter({ hasText: name }),
  ).toBeAttached(); // the card list is hidden at desktop widths
}
