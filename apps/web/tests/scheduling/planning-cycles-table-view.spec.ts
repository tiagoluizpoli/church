import { expect, type Page, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';

test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

interface SeededCycle {
  cycleName: string;
  templateName: string;
}

async function createCycleWithSundayTemplateApplied({
  page,
}: {
  page: Page;
}): Promise<SeededCycle> {
  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const cycleName = `Table View ${uniqueSuffix}`;
  const templateName = `Sunday ${uniqueSuffix}`;
  const now = new Date();
  const year = 2100 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const startDate = new Date(Date.UTC(year, month, 1))
    .toISOString()
    .slice(0, 10);
  const endDate = new Date(Date.UTC(year, month + 1, 1))
    .toISOString()
    .slice(0, 10);

  await page.goto('/scheduling/planning-cycles');

  await page.getByTestId('open-create-cycle-dialog-button').click();
  const createCycleDialog = page.getByRole('dialog', { name: 'Create cycle' });
  await createCycleDialog.getByTestId('cycle-name-input').fill(cycleName);
  await createCycleDialog.getByTestId('cycle-start-date-input').fill(startDate);
  await createCycleDialog.getByTestId('cycle-end-date-input').fill(endDate);
  await createCycleDialog.getByTestId('create-cycle-button').click();

  await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

  await page.getByTestId('open-template-library-button').click();
  await page.getByTestId('open-create-template-dialog-button').click();
  const createTemplateDialog = page.getByRole('dialog', {
    name: 'Create template',
  });
  await createTemplateDialog
    .getByTestId('template-name-input')
    .fill(templateName);
  await createTemplateDialog.getByTestId('template-weekday-select').click();
  await page.getByTestId('template-weekday-option-0').click();
  const block = createTemplateDialog.getByTestId('template-block-row').first();
  await block.getByTestId('template-block-label-input').fill('Worship');
  await block.getByTestId('template-block-start-time-input').fill('09:00');
  await block.getByTestId('template-block-end-time-input').fill('10:00');
  await createTemplateDialog.getByTestId('create-template-button').click();
  await expect(createTemplateDialog).not.toBeAttached();

  await page.getByTestId('back-from-template-library-button').click();
  await page.getByTestId('open-apply-templates-dialog-button').click();
  const applyTemplatesDialog = page.getByRole('dialog', {
    name: 'Apply templates',
  });
  await applyTemplatesDialog
    .getByTestId('template-select-checkbox')
    .first()
    .check();
  await applyTemplatesDialog.getByTestId('apply-templates-button').click();
  await expect(page.getByTestId('planning-event-card').first()).toBeAttached();

  return { cycleName, templateName };
}

test.describe('Planning cycles table view — desktop (US1/US2)', () => {
  test('cycles index renders as a table on desktop', async ({ page }) => {
    const { cycleName } = await createCycleWithSundayTemplateApplied({ page });

    await page.goto('/scheduling/planning-cycles');
    const cyclesTable = page.getByRole('grid', { name: 'Existing cycles' });
    await expect(cyclesTable).toBeVisible();
    await expect(
      cyclesTable.getByRole('columnheader', { name: 'Name' }),
    ).toBeVisible();
    await expect(
      cyclesTable.getByRole('columnheader', { name: 'Window' }),
    ).toBeVisible();
    await expect(
      cyclesTable.getByRole('columnheader', { name: 'Status' }),
    ).toBeVisible();

    const cycleRow = cyclesTable.getByRole('row', {
      name: new RegExp(cycleName),
    });
    await expect(cycleRow).toBeVisible();

    await cycleRow.click();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);
  });

  test('template library renders as a table on desktop with reachable actions', async ({
    page,
  }) => {
    const { templateName } = await createCycleWithSundayTemplateApplied({
      page,
    });
    await page.getByTestId('open-template-library-button').click();

    const templatesTable = page.getByRole('grid', { name: 'Saved templates' });
    await expect(templatesTable).toBeVisible();
    await expect(
      templatesTable.getByRole('columnheader', { name: 'Name' }),
    ).toBeVisible();
    await expect(
      templatesTable.getByRole('columnheader', { name: 'Weekday' }),
    ).toBeVisible();
    await expect(
      templatesTable.getByRole('columnheader', { name: 'Blocks' }),
    ).toBeVisible();

    const templateRow = templatesTable.getByRole('row', {
      name: new RegExp(templateName),
    });
    await expect(templateRow).toBeVisible();
    await expect(
      templateRow.getByRole('button', { name: 'Edit' }),
    ).toBeVisible();
    await expect(
      templateRow.getByRole('button', { name: 'Delete' }),
    ).toBeVisible();
  });

  test('calendar review renders expandable rows and stays independent per row', async ({
    page,
  }) => {
    const { templateName } = await createCycleWithSundayTemplateApplied({
      page,
    });

    const calendarTable = page.getByRole('grid', { name: 'Calendar review' });
    await expect(calendarTable).toBeVisible();

    const weekdayRow = calendarTable
      .getByRole('row', { name: new RegExp(templateName) })
      .first();
    await expect(weekdayRow).toBeVisible();
    await expect(calendarTable.getByText('Worship')).not.toBeVisible();

    await weekdayRow.getByRole('button', { name: /^Expand/ }).click();
    await expect(calendarTable.getByText('Worship')).toBeVisible();

    await weekdayRow.getByRole('button', { name: /^Collapse/ }).click();
    await expect(calendarTable.getByText('Worship')).not.toBeVisible();
  });

  test('locked cycle calendar review table stays read-only', async ({
    page,
  }) => {
    await createCycleWithSundayTemplateApplied({ page });

    await page.getByTestId('lock-cycle-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('locked');

    const calendarTable = page.getByRole('grid', { name: 'Calendar review' });
    await expect(calendarTable).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add manual event' }),
    ).not.toBeAttached();
    await expect(page.getByTestId('lock-cycle-button')).not.toBeAttached();
  });
});

test.describe('Planning cycles table view — mobile no-regression (US3)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('all three screens keep their card/list layout below the desktop breakpoint', async ({
    page,
  }) => {
    await createCycleWithSundayTemplateApplied({ page });

    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('planning-event-card').first()).toBeVisible();

    await page.getByTestId('open-template-library-button').click();
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('saved-template-row').first()).toBeVisible();

    await page.getByTestId('back-from-template-library-button').click();
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('planning-event-card').first()).toBeVisible();

    await page.goto('/scheduling/planning-cycles');
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(
      page.getByTestId('planning-cycle-option').first(),
    ).toBeVisible();
  });
});

test.describe('Planning cycles table view — breakpoint crossing (US3)', () => {
  test('crossing the desktop breakpoint switches layout without losing the selected cycle', async ({
    page,
  }) => {
    const { cycleName } = await createCycleWithSundayTemplateApplied({ page });

    await expect(
      page.getByRole('grid', { name: 'Calendar review' }),
    ).toBeVisible();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('planning-event-card').first()).toBeVisible();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(
      page.getByRole('grid', { name: 'Calendar review' }),
    ).toBeVisible();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);
  });
});
