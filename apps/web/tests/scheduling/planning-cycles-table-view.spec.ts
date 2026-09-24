import { expect, type Page, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';
import { fillDatePickerField } from './date-picker.helpers';
import {
  allocatedYear,
  allocatedYearSequence,
} from './planning-cycle-year.helpers';
import { fillTimeOfDayField } from './time-field.helpers';

test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

interface SeededCycle {
  cycleName: string;
  templateName: string;
  cycleYear: number;
  cycleMonth: number;
}

// This file alone seeds a cycle per test (11+ calls across ~90s). `nextYear`
// hands out a distinct year per call within this run (never colliding with
// each other), from a band no other E2E spec file uses (never colliding
// across files, #241) — see planning-cycle-year.helpers.ts.
const nextYear = allocatedYearSequence(
  'planning-cycles-table-view:create-cycle-with-sunday-template',
  20,
);

async function createCycleWithSundayTemplateApplied({
  page,
}: {
  page: Page;
}): Promise<SeededCycle> {
  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const cycleName = `Table View ${uniqueSuffix}`;
  const templateName = `Sunday ${uniqueSuffix}`;
  const year = nextYear();
  const month = new Date().getUTCMonth();
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
  await fillDatePickerField({
    page,
    trigger: createCycleDialog.getByTestId('cycle-start-date-input'),
    date: startDate,
  });
  await fillDatePickerField({
    page,
    trigger: createCycleDialog.getByTestId('cycle-end-date-input'),
    date: endDate,
  });
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
  await fillTimeOfDayField({
    field: block.getByTestId('template-block-start-time-input'),
    time: '09:00',
  });
  await fillTimeOfDayField({
    field: block.getByTestId('template-block-end-time-input'),
    time: '10:00',
  });
  await createTemplateDialog.getByTestId('create-template-button').click();
  await expect(createTemplateDialog).not.toBeAttached();

  await page.getByTestId('back-from-template-library-button').click();
  await page.getByTestId('open-apply-templates-dialog-button').click();
  const applyTemplatesDialog = page.getByRole('dialog', {
    name: 'Apply templates',
  });
  await applyTemplatesDialog
    .getByTestId('apply-template-option')
    .filter({ hasText: templateName })
    .getByTestId('template-select-checkbox')
    .check();
  await applyTemplatesDialog.getByTestId('apply-templates-button').click();
  await expect(page.getByTestId('planning-event-card').first()).toBeAttached();

  return { cycleName, templateName, cycleYear: year, cycleMonth: month };
}

/** A date inside `[year, month]` that is never a Sunday, so it can't collide
 * with the Sunday-template day-events `createCycleWithSundayTemplateApplied`
 * already generated in that same window. */
function nonSundayDateInMonth({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}): string {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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

  test('"Expand all"/"Collapse all" toggle every day row at once, one-shot not synced (US5, 021)', async ({
    page,
  }) => {
    await createCycleWithSundayTemplateApplied({ page });

    const calendarTable = page.getByRole('grid', { name: 'Calendar review' });
    await expect(calendarTable).toBeVisible();
    const rowCount = await calendarTable.getByRole('row').count();

    await page.getByRole('button', { name: 'Expand all' }).click();
    await expect(calendarTable.getByText('Worship').first()).toBeVisible();
    expect(await calendarTable.getByText('Worship').count()).toBe(rowCount - 1);

    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(calendarTable.getByText('Worship')).toHaveCount(0);

    // One-shot, not a synced toggle: re-expanding one row manually after
    // "Expand all" then "Collapse all" must still collapse everything.
    await page.getByRole('button', { name: 'Expand all' }).click();
    const firstRow = calendarTable.getByRole('row').nth(1);
    await firstRow.getByRole('button', { name: /^Collapse/ }).click();
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(calendarTable.getByText('Worship')).toHaveCount(0);
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
      page.getByRole('button', { name: 'Add event' }),
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

test.describe('Planning cycles day/slot edit and delete (US3)', () => {
  test('draft cycle supports day/slot edit and delete with slot cascade; locked cycle shows no controls', async ({
    page,
  }) => {
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
    const cycleName = `US3 Edit ${uniqueSuffix}`;
    const templateName = `US3 Template ${uniqueSuffix}`;
    const now = new Date();
    const year = allocatedYear('planning-cycles-table-view:us3-edit-delete');
    const month = now.getUTCMonth();
    const startDate = new Date(Date.UTC(year, month, 1))
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(Date.UTC(year, month + 1, 1))
      .toISOString()
      .slice(0, 10);

    await page.goto('/scheduling/planning-cycles');
    await page.getByTestId('open-create-cycle-dialog-button').click();
    const createCycleDialog = page.getByRole('dialog', {
      name: 'Create cycle',
    });
    await createCycleDialog.getByTestId('cycle-name-input').fill(cycleName);
    await fillDatePickerField({
      page,
      trigger: createCycleDialog.getByTestId('cycle-start-date-input'),
      date: startDate,
    });
    await fillDatePickerField({
      page,
      trigger: createCycleDialog.getByTestId('cycle-end-date-input'),
      date: endDate,
    });
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
    const firstBlock = createTemplateDialog
      .getByTestId('template-block-row')
      .first();
    await firstBlock.getByTestId('template-block-label-input').fill('Worship');
    await fillTimeOfDayField({
      field: firstBlock.getByTestId('template-block-start-time-input'),
      time: '09:00',
    });
    await fillTimeOfDayField({
      field: firstBlock.getByTestId('template-block-end-time-input'),
      time: '10:00',
    });
    await createTemplateDialog.getByTestId('add-template-block-button').click();
    const secondBlock = createTemplateDialog
      .getByTestId('template-block-row')
      .nth(1);
    await secondBlock.getByTestId('template-block-label-input').fill('Message');
    await fillTimeOfDayField({
      field: secondBlock.getByTestId('template-block-start-time-input'),
      time: '10:00',
    });
    await fillTimeOfDayField({
      field: secondBlock.getByTestId('template-block-end-time-input'),
      time: '11:00',
    });
    await createTemplateDialog.getByTestId('create-template-button').click();
    await expect(createTemplateDialog).not.toBeAttached();

    await page.getByTestId('back-from-template-library-button').click();
    await page.getByTestId('open-apply-templates-dialog-button').click();
    const applyTemplatesDialog = page.getByRole('dialog', {
      name: 'Apply templates',
    });
    await applyTemplatesDialog
      .getByTestId('apply-template-option')
      .filter({ hasText: templateName })
      .getByTestId('template-select-checkbox')
      .check();
    await applyTemplatesDialog.getByTestId('apply-templates-button').click();
    await expect(
      page.getByTestId('planning-event-card').first(),
    ).toBeAttached();

    const table = page.getByRole('grid', { name: 'Calendar review' });
    await expect(table).toBeVisible();

    const firstMatch = table
      .getByRole('row', { name: new RegExp(templateName) })
      .first();
    // Capture a stable id-based locator: editing the day's date can reorder
    // rows (sorted by date), which would silently re-target `.first()` to a
    // different Sunday partway through the test.
    const dayRowId = await firstMatch.getAttribute('id');
    const dayRow = page.locator(`#${dayRowId}`);
    await dayRow.getByRole('button', { name: /^Expand/ }).click();

    // Delete the non-last slot (Message); Worship must remain, and its own
    // delete control becomes disabled once it's the day's only slot.
    await table.getByRole('button', { name: 'Delete slot Message' }).click();
    await page.getByRole('button', { name: 'Delete slot' }).click();
    await expect(
      table.getByRole('button', { name: 'Delete slot Message' }),
    ).not.toBeAttached();
    await expect(
      table.getByRole('button', { name: 'Delete slot Worship' }),
    ).toBeDisabled();

    // Edit the day's start date (+1 day); FR-007a's cascade shifts the
    // remaining slot's underlying time by the same delta in the same
    // transaction (verified precisely at the integration level in
    // planning-phase3.managers.test.ts) — here we confirm the edit persists
    // and is visible end-to-end via the day row's own date text changing.
    const dayRowTextBefore = await dayRow.textContent();

    await dayRow.getByRole('button', { name: /^Edit day/ }).click();
    const editDayDialog = page.getByRole('dialog', { name: 'Edit day' });
    // `InstantField` (src/components/instant-field.tsx) pairs a
    // `DatePickerField` with a `TimeOfDayField`, not a single labelled
    // input — read the date picker trigger's displayed `dd/MM/yyyy`
    // (`formatCalendarDay`) and shift it a day; the time field is left
    // untouched.
    const startDateTrigger = editDayDialog.getByTestId('edit-event-start-date');
    const currentStartDate = await startDateTrigger.textContent();
    const [currentDay, currentMonth, currentYear] = (currentStartDate ?? '')
      .trim()
      .split('/')
      .map(Number);
    const shiftedStart = new Date(
      Date.UTC(currentYear ?? 0, (currentMonth ?? 1) - 1, currentDay ?? 1),
    );
    shiftedStart.setUTCDate(shiftedStart.getUTCDate() + 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    const shiftedStartValue = `${shiftedStart.getUTCFullYear()}-${pad(shiftedStart.getUTCMonth() + 1)}-${pad(shiftedStart.getUTCDate())}`;
    await fillDatePickerField({
      page,
      trigger: startDateTrigger,
      date: shiftedStartValue,
    });
    await editDayDialog.getByRole('button', { name: 'Save' }).click();
    await expect(editDayDialog).not.toBeAttached();

    await expect.poll(() => dayRow.textContent()).not.toBe(dayRowTextBefore);

    // Edit the slot itself.
    await table.getByRole('button', { name: 'Edit slot Worship' }).click();
    const editSlotDialog = page.getByRole('dialog', { name: 'Edit slot' });
    await editSlotDialog.getByLabel('Label').fill('Worship (edited)');
    await editSlotDialog.getByRole('button', { name: 'Save' }).click();
    await expect(editSlotDialog).not.toBeAttached();
    await expect(table.getByText('Worship (edited)')).toBeVisible();

    // Delete the whole day. cancelPlanningEvent soft-deletes at the data
    // layer, but per FR-006 the row and its slots must disappear from the
    // table and the header's event/slot counts must decrease.
    const eventCountChipBefore = await page
      .getByTestId('planning-cycle-event-count-chip')
      .textContent();

    await dayRow.getByRole('button', { name: /^Delete day/ }).click();
    await page.getByRole('button', { name: 'Delete event' }).click();

    await expect(dayRow).not.toBeAttached();
    await expect
      .poll(() =>
        page.getByTestId('planning-cycle-event-count-chip').textContent(),
      )
      .not.toBe(eventCountChipBefore);

    // Lock the cycle: no edit/delete controls should render anywhere.
    await page.getByTestId('lock-cycle-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('locked');
    await expect(
      table.getByRole('button', { name: /^Delete day/ }),
    ).toHaveCount(0);
    await expect(table.getByRole('button', { name: /^Edit day/ })).toHaveCount(
      0,
    );
  });
});

test.describe('Planning cycles mobile add/edit/delete (US1, 021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('draft cycle supports mobile add/edit/delete for day-events and slots; locked cycle shows no controls', async ({
    page,
  }) => {
    const { templateName, cycleYear, cycleMonth } =
      await createCycleWithSundayTemplateApplied({
        page,
      });

    const mobileList = page.getByTestId('planning-events-list');
    await expect(mobileList).toBeVisible();

    // Add a day-event from the mobile surface — opens as a bottom drawer.
    await mobileList.getByRole('button', { name: 'Add day-event' }).click();
    const addDialog = page.getByRole('dialog', { name: 'New Event' });
    await expect(addDialog).toBeVisible();
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
    const newEventTitle = `Mobile Added ${uniqueSuffix}`;
    await addDialog.getByLabel('Title').fill(newEventTitle);
    // Must land inside the seeded cycle's own window (its year is
    // dynamically assigned per test run, see createCycleWithSundayTemplateApplied)
    // and off any templated Sunday, or the create is rejected as out of
    // range / colliding with an existing day.
    await fillDatePickerField({
      page,
      trigger: addDialog.getByLabel('Date'),
      date: nonSundayDateInMonth({
        year: cycleYear,
        month: cycleMonth,
        day: 15,
      }),
    });
    await addDialog.getByRole('button', { name: 'Create' }).click();
    await expect(addDialog).not.toBeAttached();
    await expect(mobileList.getByText(newEventTitle)).toBeVisible();

    // Edit and delete that new day-event.
    const newCard = mobileList
      .getByTestId('planning-event-card')
      .filter({ hasText: newEventTitle });
    await newCard.getByRole('button', { name: /^Edit day/ }).click();
    const editDayDialog = page.getByRole('dialog', { name: 'Edit day' });
    await editDayDialog.getByLabel('Title').fill(`${newEventTitle} (edited)`);
    await editDayDialog.getByRole('button', { name: 'Save' }).click();
    await expect(editDayDialog).not.toBeAttached();
    await expect(
      mobileList.getByText(`${newEventTitle} (edited)`),
    ).toBeVisible();

    await newCard.getByRole('button', { name: /^Delete day/ }).click();
    await page.getByRole('button', { name: 'Delete event' }).click();
    await expect(
      mobileList.getByText(`${newEventTitle} (edited)`),
    ).not.toBeAttached();

    // Expand the templated Sunday card, add a slot, edit it, then confirm
    // its delete becomes disabled once it is the day's only remaining slot.
    const templatedCard = mobileList
      .getByTestId('planning-event-card')
      .filter({ hasText: templateName })
      .first();
    await templatedCard.getByRole('button', { name: /^Add slot to/ }).click();
    const addSlotDialog = page.getByRole('dialog', { name: 'Add slot' });
    await addSlotDialog.getByLabel('Label').fill('Prayer');
    await fillTimeOfDayField({
      field: addSlotDialog.getByTestId('create-slot-start-time-field'),
      time: '08:00',
    });
    await fillTimeOfDayField({
      field: addSlotDialog.getByTestId('create-slot-end-time-field'),
      time: '08:30',
    });
    await addSlotDialog.getByRole('button', { name: 'Add slot' }).click();
    await expect(addSlotDialog).not.toBeAttached();
    await expect(templatedCard.getByText('Prayer')).toBeVisible();

    await templatedCard
      .getByRole('button', { name: 'Edit slot Prayer' })
      .click();
    const editSlotDialog = page.getByRole('dialog', { name: 'Edit slot' });
    await editSlotDialog.getByLabel('Label').fill('Prayer (edited)');
    await editSlotDialog.getByRole('button', { name: 'Save' }).click();
    await expect(editSlotDialog).not.toBeAttached();
    await expect(templatedCard.getByText('Prayer (edited)')).toBeVisible();

    // Delete the added slot; the day's original templated slot must remain
    // and, once it is the only slot left, its own delete becomes disabled.
    await templatedCard
      .getByRole('button', { name: 'Delete slot Prayer (edited)' })
      .click();
    await page.getByRole('button', { name: 'Delete slot' }).click();
    await expect(
      templatedCard.getByRole('button', {
        name: 'Delete slot Prayer (edited)',
      }),
    ).not.toBeAttached();
    await expect(
      templatedCard.getByRole('button', { name: 'Delete slot Worship' }),
    ).toBeDisabled();

    // Lock the cycle: no mobile add/edit/delete affordance may remain.
    await page.getByTestId('lock-cycle-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('locked');
    await expect(
      mobileList.getByRole('button', { name: 'Add day-event' }),
    ).not.toBeAttached();
    await expect(
      mobileList.getByRole('button', { name: /^Edit day/ }),
    ).toHaveCount(0);
    await expect(
      mobileList.getByRole('button', { name: /^Delete day/ }),
    ).toHaveCount(0);
    await expect(
      mobileList.getByRole('button', { name: /^Edit slot/ }),
    ).toHaveCount(0);
    await expect(
      mobileList.getByRole('button', { name: /^Delete slot/ }),
    ).toHaveCount(0);
  });

  test('a lock that races a mobile edit fails the save with a visible error and applies no change (FR-010)', async ({
    page,
    browser,
  }) => {
    const { templateName } = await createCycleWithSundayTemplateApplied({
      page,
    });
    const cycleUrl = page.url();

    const mobileList = page.getByTestId('planning-events-list');
    const templatedCard = mobileList
      .getByTestId('planning-event-card')
      .filter({ hasText: templateName })
      .first();

    await templatedCard.getByRole('button', { name: /^Edit day/ }).click();
    const editDayDialog = page.getByRole('dialog', { name: 'Edit day' });
    await expect(editDayDialog).toBeVisible();
    await editDayDialog.getByLabel('Title').fill('Raced edit');

    // A second session locks the cycle while the first session's mobile
    // drawer is still open — the "lock that occurs between page load and
    // the action" race from spec 020's FR-013, verified here specifically
    // on the mobile ResponsiveFormSurface.
    const secondContext = await browser.newContext({
      storageState: CHURCH_ADMIN_STORAGE_STATE,
    });
    const secondPage = await secondContext.newPage();
    await secondPage.goto(cycleUrl);
    await secondPage.getByTestId('lock-cycle-button').click();
    await expect(secondPage.getByTestId('selected-cycle-state')).toHaveText(
      'locked',
    );
    await secondContext.close();

    await editDayDialog.getByRole('button', { name: 'Save' }).click();

    // Assert on the sonner error-toast's `data-type`, not its message text
    // (matches the convention already used in cross-cutting.spec.ts) — the
    // backend's rejection message is an IllegalStateTransitionError whose
    // wording ("Cannot transition from scheduled to update") is a domain
    // detail that shouldn't need to contain the word "error"/"fail" for
    // FR-013's "fails with a visible error" contract to hold.
    await expect(
      page.locator('[data-sonner-toast][data-type="error"]'),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText('Raced edit')).toHaveCount(0);
    // Every week the Sunday template generated shares this exact title, so
    // this locator legitimately matches all of them (not just the one that
    // raced the lock) — asserting `.first()` is enough to confirm the
    // original title survived, without over-claiming which specific day.
    await expect(
      page.getByTestId('planning-events-list').getByText(templateName).first(),
    ).toBeVisible();
  });
});

test.describe('Planning cycles mobile timezone formatting (US2, 021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  // The e2e-provisioned Church's timezone is UTC (no timezone passed to
  // `provisionChurch`). Europe/London is UTC+1 in May, so a card rendering
  // the browser's zone instead of the Church's would show 10:00 here.
  test.use({ timezoneId: 'Europe/London' });

  test('the card list shows the Worship block at its Church Timezone (UTC) time, not the browser zone', async ({
    page,
  }) => {
    await createCycleWithSundayTemplateApplied({ page });

    const mobileList = page.getByTestId('planning-events-list');
    await expect(mobileList).toBeVisible();
    await expect(mobileList.getByText(/Z/)).toHaveCount(0);

    const firstCard = mobileList.getByTestId('planning-event-card').first();
    // The Worship block is entered as 09:00-10:00; a card rendering the
    // browser's zone instead of the Church's (UTC) would shift this whole
    // range an hour later.
    await expect(firstCard).toContainText('09:00 – 10:00');
    await expect(firstCard).not.toContainText('10:00 – 11:00');
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
