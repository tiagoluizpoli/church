import { expect, type Page, type TestInfo, test } from '@playwright/test';
import {
  applyTemplatesViaApi,
  createCycleViaApi,
  createEventTemplateViaApi,
} from './cycle-api.helpers';
import { fillDatePickerField } from './date-picker.helpers';
import {
  dayOfMonth,
  nonSundayDay,
  planningMonth,
} from './planning-month.helpers';
import { createTemplateOnNestedPage } from './template-create.helpers';
import { fillTimeOfDayField } from './time-field.helpers';
import {
  newPersonaContext,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import {
  loadPlanningAdminJourney,
  type PlanningAdminJourney,
} from '@/tests/fixtures/journeys/planning-admin';

interface SeededCycle {
  journey: PlanningAdminJourney;
  cycleName: string;
  templateName: string;
  /** First day of the cycle's month, `yyyy-MM-dd`. */
  monthStart: string;
}

interface CreateCycleWithSundayTemplateAppliedParams {
  page: Page;
  testInfo: TestInfo;
}

// Setup only: the create/template/apply UI flow is asserted by the US3 edit
// test below and us1-admin-plan, so this reaches the same state through the
// API and then opens the cycle, as the UI flow leaves it.
async function createCycleWithSundayTemplateApplied({
  page,
  testInfo,
}: CreateCycleWithSundayTemplateAppliedParams): Promise<SeededCycle> {
  const journey = loadPlanningAdminJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  const cycleName = 'Table View';
  const templateName = 'Sunday Service';
  const { startDate, endDate } = planningMonth({ anchor: journey.anchor });

  const cycle = await createCycleViaApi({
    page,
    name: cycleName,
    startDate,
    endDate,
  });
  const template = await createEventTemplateViaApi({
    page,
    name: templateName,
    weekday: 0,
    blocks: [{ label: 'Worship', startTime: '09:00', endTime: '10:00' }],
  });
  await applyTemplatesViaApi({
    page,
    cycleId: cycle.id,
    templateIds: [template.id],
  });

  await page.goto(`/cycles/${cycle.id}`);
  // First visit: Vite dev transforms the route's module graph on demand.
  await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('planning-event-card').first()).toBeAttached();

  return { journey, cycleName, templateName, monthStart: startDate };
}

test.describe('Cycles table view — desktop (US1/US2)', () => {
  test('cycles index renders as a table on desktop', async ({
    page,
  }, testInfo) => {
    const { cycleName } = await createCycleWithSundayTemplateApplied({
      page,
      testInfo,
    });

    await page.goto('/cycles');
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
  }, testInfo) => {
    const { templateName } = await createCycleWithSundayTemplateApplied({
      page,
      testInfo,
    });
    await page.getByTestId('open-template-library-button').click();

    const templatesTable = page.getByRole('grid', { name: 'Modelos salvos' });
    await expect(templatesTable).toBeVisible();
    await expect(
      templatesTable.getByRole('columnheader', { name: 'Nome' }),
    ).toBeVisible();
    await expect(
      templatesTable.getByRole('columnheader', { name: 'Dia da semana' }),
    ).toBeVisible();
    await expect(
      templatesTable.getByRole('columnheader', { name: 'Blocos' }),
    ).toBeVisible();

    const templateRow = templatesTable.getByRole('row', {
      name: new RegExp(templateName),
    });
    await expect(templateRow).toBeVisible();
    await expect(
      templateRow.getByRole('button', { name: 'Editar' }),
    ).toBeVisible();
    await expect(
      templateRow.getByRole('button', { name: 'Excluir' }),
    ).toBeVisible();
  });

  test('calendar review renders expandable rows and stays independent per row', async ({
    page,
  }, testInfo) => {
    const { templateName } = await createCycleWithSundayTemplateApplied({
      page,
      testInfo,
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
  }, testInfo) => {
    await createCycleWithSundayTemplateApplied({ page, testInfo });

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

  test('sent cycle calendar review table stays read-only', async ({
    page,
  }, testInfo) => {
    await createCycleWithSundayTemplateApplied({ page, testInfo });

    await page.getByTestId('send-cycle-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('sent');

    const calendarTable = page.getByRole('grid', { name: 'Calendar review' });
    await expect(calendarTable).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add event' }),
    ).not.toBeAttached();
    await expect(page.getByTestId('send-cycle-button')).not.toBeAttached();
  });
});

test.describe('Cycles table view — mobile no-regression (US3)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('all three screens keep their card/list layout below the desktop breakpoint', async ({
    page,
  }, testInfo) => {
    await createCycleWithSundayTemplateApplied({ page, testInfo });

    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('planning-event-card').first()).toBeVisible();

    const cycleReviewUrl = page.url();
    await page.getByTestId('open-template-library-button').click();
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('saved-template-row').first()).toBeVisible();

    await page.goto(cycleReviewUrl);
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('planning-event-card').first()).toBeVisible();

    await page.goto('/cycles');
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('cycle-option').first()).toBeVisible();
  });
});

test.describe('Cycles day/time block edit and delete (US3)', () => {
  test('draft cycle supports day/time block edit and delete with time block cascade; sent cycle shows no controls', async ({
    page,
  }, testInfo) => {
    const journey = loadPlanningAdminJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.admin });
    const cycleName = 'US3 Edit';
    const templateName = 'US3 Template';
    const { startDate, endDate } = planningMonth({ anchor: journey.anchor });

    await page.goto('/cycles');
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

    const cycleReviewUrl = page.url();
    await page.getByTestId('open-template-library-button').click();
    await createTemplateOnNestedPage({
      page,
      name: templateName,
      weekday: 0,
      blocks: [
        { label: 'Worship', startTime: '09:00', endTime: '10:00' },
        { label: 'Message', startTime: '10:00', endTime: '11:00' },
      ],
    });

    await page.goto(cycleReviewUrl);
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

    // Delete the non-last time block (Message); Worship must remain, and its own
    // delete control becomes disabled once it's the day's only time block.
    await table
      .getByRole('button', { name: 'Delete time block Message' })
      .click();
    await page.getByRole('button', { name: 'Delete time block' }).click();
    await expect(
      table.getByRole('button', { name: 'Delete time block Message' }),
    ).not.toBeAttached();
    await expect(
      table.getByRole('button', { name: 'Delete time block Worship' }),
    ).toBeDisabled();

    // Edit the day's start date (+1 day); FR-007a's cascade shifts the
    // remaining time block's underlying time by the same delta in the same
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

    // Edit the time block itself.
    await table
      .getByRole('button', { name: 'Edit time block Worship' })
      .click();
    const editEventTimeBlockDialog = page.getByRole('dialog', {
      name: 'Edit time block',
    });
    await editEventTimeBlockDialog.getByLabel('Label').fill('Worship (edited)');
    await editEventTimeBlockDialog
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(editEventTimeBlockDialog).not.toBeAttached();
    await expect(table.getByText('Worship (edited)')).toBeVisible();

    // Delete the whole day. cancelPlanningEvent soft-deletes at the data
    // layer, but per FR-006 the row and its time blocks must disappear from the
    // table and the header's event/time block counts must decrease.
    const eventCountChipBefore = await page
      .getByTestId('cycle-event-count-chip')
      .textContent();

    await dayRow.getByRole('button', { name: /^Delete day/ }).click();
    await page.getByRole('button', { name: 'Delete event' }).click();

    await expect(dayRow).not.toBeAttached();
    await expect
      .poll(() => page.getByTestId('cycle-event-count-chip').textContent())
      .not.toBe(eventCountChipBefore);

    // Send the cycle: no edit/delete controls should render anywhere.
    await page.getByTestId('send-cycle-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('sent');
    await expect(
      table.getByRole('button', { name: /^Delete day/ }),
    ).toHaveCount(0);
    await expect(table.getByRole('button', { name: /^Edit day/ })).toHaveCount(
      0,
    );
  });
});

test.describe('Cycles mobile add/edit/delete (US1, 021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('draft cycle supports mobile add/edit/delete for day-events and time blocks; sent cycle shows no controls', async ({
    page,
  }, testInfo) => {
    const { templateName, monthStart } =
      await createCycleWithSundayTemplateApplied({ page, testInfo });

    const mobileList = page.getByTestId('planning-events-list');
    await expect(mobileList).toBeVisible();

    // Add a day-event from the mobile surface — opens as a bottom drawer.
    await mobileList.getByRole('button', { name: 'Add day-event' }).click();
    const addDialog = page.getByRole('dialog', { name: 'New Event' });
    await expect(addDialog).toBeVisible();
    const newEventTitle = 'Mobile Added';
    await addDialog.getByLabel('Title').fill(newEventTitle);
    // Must land inside the seeded cycle's own window (derived from the
    // journey anchor, see createCycleWithSundayTemplateApplied)
    // and off any templated Sunday, or the create is rejected as out of
    // range / colliding with an existing day.
    await fillDatePickerField({
      page,
      trigger: addDialog.getByLabel('Start date'),
      date: nonSundayDay({ day: dayOfMonth({ monthStart, dayOfMonth: 15 }) }),
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

    // Expand the templated Sunday card, add a time block, edit it, then confirm
    // its delete becomes disabled once it is the day's only remaining time block.
    const templatedCard = mobileList
      .getByTestId('planning-event-card')
      .filter({ hasText: templateName })
      .first();
    await templatedCard
      .getByRole('button', { name: /^Add time block to/ })
      .click();
    const addEventTimeBlockDialog = page.getByRole('dialog', {
      name: 'Add time block',
    });
    await addEventTimeBlockDialog.getByLabel('Label').fill('Prayer');
    await fillTimeOfDayField({
      field: addEventTimeBlockDialog.getByTestId(
        'create-event-time-block-start-time-field',
      ),
      time: '08:00',
    });
    await fillTimeOfDayField({
      field: addEventTimeBlockDialog.getByTestId(
        'create-event-time-block-end-time-field',
      ),
      time: '08:30',
    });
    await addEventTimeBlockDialog
      .getByRole('button', { name: 'Add time block' })
      .click();
    await expect(addEventTimeBlockDialog).not.toBeAttached();
    await expect(templatedCard.getByText('Prayer')).toBeVisible();

    await templatedCard
      .getByRole('button', { name: 'Edit time block Prayer' })
      .click();
    const editEventTimeBlockDialog = page.getByRole('dialog', {
      name: 'Edit time block',
    });
    await editEventTimeBlockDialog.getByLabel('Label').fill('Prayer (edited)');
    await editEventTimeBlockDialog
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(editEventTimeBlockDialog).not.toBeAttached();
    await expect(templatedCard.getByText('Prayer (edited)')).toBeVisible();

    // Delete the added time block; the day's original templated time block must remain
    // and, once it is the only time block left, its own delete becomes disabled.
    await templatedCard
      .getByRole('button', { name: 'Delete time block Prayer (edited)' })
      .click();
    await page.getByRole('button', { name: 'Delete time block' }).click();
    await expect(
      templatedCard.getByRole('button', {
        name: 'Delete time block Prayer (edited)',
      }),
    ).not.toBeAttached();
    await expect(
      templatedCard.getByRole('button', { name: 'Delete time block Worship' }),
    ).toBeDisabled();

    // Send the cycle: no mobile add/edit/delete affordance may remain.
    await page.getByTestId('send-cycle-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('sent');
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
      mobileList.getByRole('button', { name: /^Edit time block/ }),
    ).toHaveCount(0);
    await expect(
      mobileList.getByRole('button', { name: /^Delete time block/ }),
    ).toHaveCount(0);
  });

  test('a send that races a mobile edit fails the save with a visible error and applies no change (FR-010)', async ({
    page,
    browser,
  }, testInfo) => {
    const { journey, templateName } =
      await createCycleWithSundayTemplateApplied({ page, testInfo });
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

    // A second session sends the cycle while the first session's mobile
    // drawer is still open — the "send that occurs between page load and
    // the action" race from spec 020's FR-013, verified here specifically
    // on the mobile ResponsiveFormSurface.
    const secondContext = await newPersonaContext({
      browser,
      persona: journey.personas.admin,
    });
    const secondPage = await secondContext.newPage();
    await secondPage.goto(cycleUrl);
    await secondPage.getByTestId('send-cycle-button').click();
    await expect(secondPage.getByTestId('selected-cycle-state')).toHaveText(
      'sent',
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
    // raced the send) — asserting `.first()` is enough to confirm the
    // original title survived, without over-claiming which specific day.
    await expect(
      page.getByTestId('planning-events-list').getByText(templateName).first(),
    ).toBeVisible();
  });
});

test.describe('Cycles mobile timezone formatting (US2, 021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  // The journey Church's timezone is America/Sao_Paulo (UTC-3, no DST), and
  // the template block is entered as Church-local 09:00. Europe/London is
  // UTC+1 or UTC+0, so a card rendering the browser's zone instead of the
  // Church's would shift the range here.
  test.use({ timezoneId: 'Europe/London' });

  test('the card list shows the Worship block at its Church Timezone time, not the browser zone', async ({
    page,
  }, testInfo) => {
    await createCycleWithSundayTemplateApplied({ page, testInfo });

    const mobileList = page.getByTestId('planning-events-list');
    await expect(mobileList).toBeVisible();
    await expect(mobileList.getByText(/Z/)).toHaveCount(0);

    const firstCard = mobileList.getByTestId('planning-event-card').first();
    // The Worship block is entered as 09:00-10:00 Church-local; a card
    // rendering the browser's zone instead of the Church's would shift this
    // whole range (to 12:00 or 13:00 in London).
    await expect(firstCard).toContainText('09:00 – 10:00');
    await expect(firstCard).not.toContainText(/1[23]:00 – 1[34]:00/);
  });
});

test.describe('Cycles table view — breakpoint crossing (US3)', () => {
  test('crossing the desktop breakpoint switches layout without losing the selected cycle', async ({
    page,
  }, testInfo) => {
    const { cycleName } = await createCycleWithSundayTemplateApplied({
      page,
      testInfo,
    });

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
