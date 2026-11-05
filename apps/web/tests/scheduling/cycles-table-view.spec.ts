import { m } from '@church/i18n/messages';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import {
  applyTemplatesViaApi,
  createCycleViaApi,
  createEventTemplateViaApi,
} from './cycle-api.helpers';
import { fillDatePickerField } from './date-picker.helpers';
import { addEventOnNestedPage } from './event-create.helpers';
import {
  dayOfMonth,
  nonSundayDay,
  planningMonth,
} from './planning-month.helpers';
import { createTemplateOnNestedPage } from './template-create.helpers';
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
    const cyclesTable = page.getByRole('grid', { name: 'Atuais e futuros' });
    await expect(cyclesTable).toBeVisible();
    await expect(
      cyclesTable.getByRole('columnheader', { name: 'Nome' }),
    ).toBeVisible();
    await expect(
      cyclesTable.getByRole('columnheader', { name: 'Datas' }),
    ).toBeVisible();
    await expect(
      cyclesTable.getByRole('columnheader', { name: 'Situação' }),
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
    await page.goto('/event-templates');

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
      templateRow.getByRole('link', { name: 'Editar' }),
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

    const calendarTable = page.getByRole('grid', {
      name: m.cycle_review_title({}, { locale: 'pt-BR' }),
    });
    await expect(calendarTable).toBeVisible();

    const weekdayRow = calendarTable
      .getByRole('row', { name: new RegExp(templateName) })
      .first();
    await expect(weekdayRow).toBeVisible();
    await expect(calendarTable.getByText('Worship')).not.toBeVisible();

    await weekdayRow.getByRole('button', { name: /^Expandir/ }).click();
    await expect(calendarTable.getByText('Worship')).toBeVisible();

    await weekdayRow.getByRole('button', { name: /^Recolher/ }).click();
    await expect(calendarTable.getByText('Worship')).not.toBeVisible();
  });

  test('"Expand all"/"Collapse all" toggle every day row at once, one-shot not synced (US5, 021)', async ({
    page,
  }, testInfo) => {
    await createCycleWithSundayTemplateApplied({ page, testInfo });

    const calendarTable = page.getByRole('grid', {
      name: m.cycle_review_title({}, { locale: 'pt-BR' }),
    });
    await expect(calendarTable).toBeVisible();
    // Header row and the week heading rows are not Events.
    const weekRows = await calendarTable
      .getByRole('row', { name: /^Semana de/ })
      .count();
    const rowCount = (await calendarTable.getByRole('row').count()) - weekRows;

    await page
      .getByRole('button', {
        name: m.cycle_review_expand_all({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(calendarTable.getByText('Worship').first()).toBeVisible();
    expect(await calendarTable.getByText('Worship').count()).toBe(rowCount - 1);

    await page
      .getByRole('button', {
        name: m.cycle_review_collapse_all({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(calendarTable.getByText('Worship')).toHaveCount(0);

    // One-shot, not a synced toggle: re-expanding one row manually after
    // "Expand all" then "Collapse all" must still collapse everything.
    await page
      .getByRole('button', {
        name: m.cycle_review_expand_all({}, { locale: 'pt-BR' }),
      })
      .click();
    await calendarTable
      .getByRole('button', { name: /^Recolher/ })
      .first()
      .click();
    await page
      .getByRole('button', {
        name: m.cycle_review_collapse_all({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(calendarTable.getByText('Worship')).toHaveCount(0);
  });

  test('sent cycle calendar review table stays read-only', async ({
    page,
  }, testInfo) => {
    await createCycleWithSundayTemplateApplied({ page, testInfo });

    await page.getByTestId('send-cycle-button').click();
    await page.getByTestId('confirm-cycle-send-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText(
      m.cycle_state_sent({}, { locale: 'pt-BR' }),
    );

    const calendarTable = page.getByRole('grid', {
      name: m.cycle_review_title({}, { locale: 'pt-BR' }),
    });
    await expect(calendarTable).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: m.cycles_add_event_button({}, { locale: 'pt-BR' }),
      }),
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
    await page.goto('/event-templates');
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
  test('draft cycle edits an Event on its nested page, keeps time block delete, and a sent cycle shows no controls', async ({
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
      name: 'Novo ciclo',
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
    await page.goto('/event-templates');
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
      name: 'Aplicar modelos',
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

    const table = page.getByRole('grid', {
      name: m.cycle_review_title({}, { locale: 'pt-BR' }),
    });
    await expect(table).toBeVisible();

    const firstMatch = table
      .getByRole('row', { name: new RegExp(templateName) })
      .first();
    // Capture a stable id-based locator: editing the day's date can reorder
    // rows (sorted by date), which would silently re-target `.first()` to a
    // different Sunday partway through the test.
    const dayRowId = await firstMatch.getAttribute('id');
    const dayRow = page.locator(`#${dayRowId}`);
    await dayRow.getByRole('button', { name: /^Expandir/ }).click();

    // Delete the non-last time block (Message); Worship must remain, and its own
    // delete control becomes disabled once it's the day's only time block.
    await table
      .getByRole('button', { name: 'Excluir horário Message' })
      .click();
    await page.getByRole('button', { name: 'Excluir horário' }).click();
    await expect(
      table.getByRole('button', { name: 'Excluir horário Message' }),
    ).not.toBeAttached();
    await expect(
      table.getByRole('button', { name: 'Excluir horário Worship' }),
    ).toBeDisabled();

    // Edit the Event on its nested page: the retained Worship block is
    // relabelled in place and the review returns with the Event revealed.
    await dayRow.getByRole('link', { name: /^Editar dia/ }).click();
    await expect(page).toHaveURL(/\/cycles\/[^/]+\/events\/[^/?]+$/);
    await page
      .getByTestId('event-time-block-row')
      .getByLabel(m.event_editor_block_label({}, { locale: 'pt-BR' }))
      .fill('Worship (edited)');
    await page
      .getByRole('button', {
        name: m.event_editor_create_submit({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(page).toHaveURL(/\/cycles\/[^/]+\?eventId=/);
    await expect(table.getByText('Worship (edited)')).toBeVisible();
    // Row ids are regenerated per page load; the review marks the saved Event.
    const editedRow = table.getByTestId('revealed-event-row');

    // Delete the whole day. cancelPlanningEvent soft-deletes at the data
    // layer, but per FR-006 the row and its time blocks must disappear from the
    // table and the header's event/time block counts must decrease.
    const eventCountChipBefore = await page
      .getByTestId('cycle-event-count-chip')
      .textContent();

    await editedRow.getByRole('button', { name: /^Excluir dia/ }).click();
    await page.getByRole('button', { name: 'Excluir evento' }).click();

    await expect(editedRow).not.toBeAttached();
    await expect
      .poll(() => page.getByTestId('cycle-event-count-chip').textContent())
      .not.toBe(eventCountChipBefore);

    // Send the cycle: no edit/delete controls should render anywhere.
    await page.getByTestId('send-cycle-button').click();
    await page.getByTestId('confirm-cycle-send-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText(
      m.cycle_state_sent({}, { locale: 'pt-BR' }),
    );
    await expect(
      table.getByRole('button', { name: /^Excluir dia/ }),
    ).toHaveCount(0);
    await expect(table.getByRole('link', { name: /^Editar dia/ })).toHaveCount(
      0,
    );
  });
});

test.describe('Cycles mobile add/edit/delete (US1, 021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('draft cycle supports mobile add, nested edit and delete for Events and time blocks; sent cycle shows no controls', async ({
    page,
  }, testInfo) => {
    const { templateName, monthStart } =
      await createCycleWithSundayTemplateApplied({ page, testInfo });

    const mobileList = page.getByTestId('planning-events-list');
    await expect(mobileList).toBeVisible();

    // Add an Event through the one nested New Event page. It must land
    // inside the seeded cycle's own window (derived from the journey anchor,
    // see createCycleWithSundayTemplateApplied) and off any templated Sunday.
    const newEventTitle = 'Mobile Added';
    await addEventOnNestedPage({
      page,
      title: newEventTitle,
      startDate: nonSundayDay({
        day: dayOfMonth({ monthStart, dayOfMonth: 15 }),
      }),
    });
    // Its card is revealed, with the whole-Event Time block that shares its title.
    await expect(
      mobileList
        .getByTestId('planning-event-card')
        .filter({ hasText: newEventTitle }),
    ).toBeVisible();

    // Edit and delete that new day-event.
    const newCard = mobileList
      .getByTestId('planning-event-card')
      .filter({ hasText: newEventTitle });
    await newCard.getByRole('link', { name: /^Editar dia/ }).click();
    await page
      .getByLabel(m.event_editor_title_label({}, { locale: 'pt-BR' }))
      .fill(`${newEventTitle} (edited)`);
    await page
      .getByRole('button', {
        name: m.event_editor_create_submit({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(page).toHaveURL(/\/cycles\/[^/]+\?eventId=/);
    await expect(
      mobileList.getByText(`${newEventTitle} (edited)`),
    ).toBeVisible();

    await newCard.getByRole('button', { name: /^Excluir dia/ }).click();
    await page.getByRole('button', { name: 'Excluir evento' }).click();
    await expect(
      mobileList.getByText(`${newEventTitle} (edited)`),
    ).not.toBeAttached();

    // Add a time block to the templated Sunday on its nested page, then
    // confirm its delete becomes disabled once it is the only one left.
    const templatedCard = mobileList
      .getByTestId('planning-event-card')
      .filter({ hasText: templateName })
      .first();
    await templatedCard.getByRole('link', { name: /^Editar dia/ }).click();
    await page
      .getByRole('button', {
        name: m.event_editor_block_add({}, { locale: 'pt-BR' }),
      })
      .click();
    await page
      .getByTestId('event-time-block-row')
      .nth(1)
      .getByLabel(m.event_editor_block_label({}, { locale: 'pt-BR' }))
      .fill('Prayer (edited)');
    await page
      .getByRole('button', {
        name: m.event_editor_create_submit({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(page).toHaveURL(/\/cycles\/[^/]+\?eventId=/);
    await expect(templatedCard.getByText('Prayer (edited)')).toBeVisible();

    // Delete the added time block; the day's original templated time block must remain
    // and, once it is the only time block left, its own delete becomes disabled.
    await templatedCard
      .getByRole('button', { name: 'Excluir horário Prayer (edited)' })
      .click();
    await page.getByRole('button', { name: 'Excluir horário' }).click();
    await expect(
      templatedCard.getByRole('button', {
        name: 'Excluir horário Prayer (edited)',
      }),
    ).not.toBeAttached();
    await expect(
      templatedCard.getByRole('button', { name: 'Excluir horário Worship' }),
    ).toBeDisabled();

    // Send the cycle: no mobile add/edit/delete affordance may remain.
    await page.getByTestId('send-cycle-button').click();
    await page.getByTestId('confirm-cycle-send-button').click();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText(
      m.cycle_state_sent({}, { locale: 'pt-BR' }),
    );
    await expect(
      page.getByRole('link', {
        name: m.cycles_add_event_button({}, { locale: 'pt-BR' }),
      }),
    ).not.toBeAttached();
    await expect(
      mobileList.getByRole('link', { name: /^Editar dia/ }),
    ).toHaveCount(0);
    await expect(
      mobileList.getByRole('button', { name: /^Excluir dia/ }),
    ).toHaveCount(0);
    await expect(
      mobileList.getByRole('button', { name: /^Excluir horário/ }),
    ).toHaveCount(0);
  });

  test('a send that races a mobile edit refuses the save, reloads the Sent Cycle and applies no change (FR-010)', async ({
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

    await templatedCard.getByRole('link', { name: /^Editar dia/ }).click();
    await page
      .getByLabel(m.event_editor_title_label({}, { locale: 'pt-BR' }))
      .fill('Raced edit');

    // A second session sends the cycle while the first session's mobile
    // Event page is still open — the "send that occurs between page load
    // and the action" race from spec 020's FR-013.
    const secondContext = await newPersonaContext({
      browser,
      persona: journey.personas.admin,
    });
    const secondPage = await secondContext.newPage();
    await secondPage.goto(cycleUrl);
    await secondPage.getByTestId('send-cycle-button').click();
    await secondPage.getByTestId('confirm-cycle-send-button').click();
    await expect(secondPage.getByTestId('selected-cycle-state')).toHaveText(
      m.cycle_state_sent({}, { locale: 'pt-BR' }),
    );
    await secondContext.close();

    await page
      .getByRole('button', {
        name: m.event_editor_create_submit({}, { locale: 'pt-BR' }),
      })
      .click();

    // The refusal reloads the authoritative Sent Cycle: no draft form remains.
    await expect(page.getByTestId('event-edit-not-draft')).toBeVisible();
    await page.goto(cycleUrl);
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
      page.getByRole('grid', {
        name: m.cycle_review_title({}, { locale: 'pt-BR' }),
      }),
    ).toBeVisible();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByTestId('planning-event-card').first()).toBeVisible();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(
      page.getByRole('grid', {
        name: m.cycle_review_title({}, { locale: 'pt-BR' }),
      }),
    ).toBeVisible();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);
  });
});
