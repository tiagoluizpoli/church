import { expect, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';
import { fillTimeOfDayField } from './time-field.helpers';

test.use({
  storageState: CHURCH_ADMIN_STORAGE_STATE,
  viewport: { width: 767, height: 1200 },
});

test('church admin can create a template with an overnight time block', async ({
  page,
}) => {
  const templateName = `Overnight Watch ${Date.now()}`;

  await page.goto('/scheduling/planning-cycles/templates');

  await page.getByTestId('open-create-template-dialog-button').click();
  const createTemplateDialog = page.getByRole('dialog', {
    name: 'Create template',
  });
  await createTemplateDialog
    .getByTestId('template-name-input')
    .fill(templateName);
  await createTemplateDialog.getByTestId('template-weekday-select').click();
  await page.getByTestId('template-weekday-option-3').click();

  const block = createTemplateDialog.getByTestId('template-block-row').first();
  await block.getByTestId('template-block-label-input').fill('Vigil');
  await fillTimeOfDayField({
    field: block.getByTestId('template-block-start-time-input'),
    time: '22:00',
  });
  await fillTimeOfDayField({
    field: block.getByTestId('template-block-end-time-input'),
    time: '02:00',
  });

  await expect(block.getByTestId('template-block-span')).toHaveText(
    'Runs 4h · ends next day',
  );

  await createTemplateDialog.getByTestId('create-template-button').click();

  await expect(createTemplateDialog).not.toBeAttached();
  await expect(
    page.getByTestId('saved-template-row').filter({ hasText: templateName }),
  ).toBeVisible();
});
