import { expect, test } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
} from '../global-setup';

interface PlanningMonth {
  cycleName: string;
  startDate: string;
  endDate: string;
  overlapStartDate: string;
  overlapEndDate: string;
  firstSunday: string;
  firstWednesday: string;
  lastSunday: string;
  expectedEvents: number;
  expectedSlots: number;
  dynamicStartDate: string;
  dynamicEndDate: string;
}

function getRequiredDate({
  dates,
  label,
}: {
  dates: string[];
  label: string;
}): string {
  const date = dates[0];
  if (!date) {
    throw new Error(`Expected at least one ${label} date`);
  }

  return date;
}

function getLastRequiredDate({
  dates,
  label,
}: {
  dates: string[];
  label: string;
}): string {
  const date = dates[dates.length - 1];
  if (!date) {
    throw new Error(`Expected at least one ${label} date`);
  }

  return date;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countMatchingWeekdays({
  start,
  end,
  weekday,
}: {
  start: Date;
  end: Date;
  weekday: number;
}): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor < end) {
    if (cursor.getUTCDay() === weekday) {
      dates.push(toDateString(cursor));
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function createPlanningMonth(): PlanningMonth {
  const now = new Date();
  const year = 2400 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const overlapStart = new Date(Date.UTC(year, month, 15));
  const overlapEnd = new Date(Date.UTC(year, month + 1, 15));
  const sundayDates = countMatchingWeekdays({
    start,
    end,
    weekday: 0,
  });
  const wednesdayDates = countMatchingWeekdays({
    start,
    end,
    weekday: 3,
  });
  const lastDayInsideCycle = new Date(end);
  lastDayInsideCycle.setUTCDate(lastDayInsideCycle.getUTCDate() - 1);
  const dynamicStart = new Date(
    Date.UTC(
      lastDayInsideCycle.getUTCFullYear(),
      lastDayInsideCycle.getUTCMonth(),
      lastDayInsideCycle.getUTCDate(),
      9,
      0,
    ),
  );
  const dynamicEnd = new Date(
    Date.UTC(
      lastDayInsideCycle.getUTCFullYear(),
      lastDayInsideCycle.getUTCMonth(),
      lastDayInsideCycle.getUTCDate() + 2,
      17,
      0,
    ),
  );

  return {
    cycleName: `US1 Admin Plan ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}`,
    startDate: toDateString(start),
    endDate: toDateString(end),
    overlapStartDate: toDateString(overlapStart),
    overlapEndDate: toDateString(overlapEnd),
    firstSunday: getRequiredDate({ dates: sundayDates, label: 'Sunday' }),
    firstWednesday: getRequiredDate({
      dates: wednesdayDates,
      label: 'Wednesday',
    }),
    lastSunday: getLastRequiredDate({ dates: sundayDates, label: 'Sunday' }),
    expectedEvents: sundayDates.length + wednesdayDates.length,
    expectedSlots: sundayDates.length * 3 + wednesdayDates.length,
    dynamicStartDate: toDateString(dynamicStart),
    dynamicEndDate: toDateString(dynamicEnd),
  };
}

test.use({
  storageState: CHURCH_ADMIN_STORAGE_STATE,
  viewport: { width: 767, height: 1200 },
});

test('church admin can plan, review, and lock a cycle while volunteers stay hidden from it', async ({
  browser,
  page,
}) => {
  const month = createPlanningMonth();
  const sundayTemplateName = `Sunday Service ${month.cycleName}`;
  const wednesdayTemplateName = `Wednesday Service ${month.cycleName}`;
  const sundayGatheringName = `Sunday Gathering ${month.cycleName}`;

  await page.goto('/scheduling/planning-cycles');

  await page.getByTestId('open-create-cycle-dialog-button').click();
  const createCycleDialog = page.getByRole('dialog', { name: 'Create cycle' });
  await createCycleDialog.getByTestId('cycle-name-input').fill(month.cycleName);
  await createCycleDialog
    .getByTestId('cycle-start-date-input')
    .fill(month.startDate);
  await createCycleDialog
    .getByTestId('cycle-end-date-input')
    .fill(month.endDate);
  await createCycleDialog.getByTestId('create-cycle-button').click();

  await expect(page.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );
  await expect(page.getByTestId('selected-cycle-state')).toHaveText('draft');

  await page.getByTestId('open-template-library-button').click();

  await page.getByTestId('open-create-template-dialog-button').click();
  const createTemplateDialog = page.getByRole('dialog', {
    name: 'Create template',
  });
  await createTemplateDialog
    .getByTestId('template-name-input')
    .fill(sundayTemplateName);
  await createTemplateDialog.getByTestId('template-weekday-select').click();
  await page.getByTestId('template-weekday-option-0').click();
  await createTemplateDialog.getByTestId('add-template-block-button').click();
  await createTemplateDialog.getByTestId('add-template-block-button').click();

  const sundayBlocks = createTemplateDialog.getByTestId('template-block-row');
  await sundayBlocks
    .nth(0)
    .getByTestId('template-block-label-input')
    .fill('Welcome');
  await sundayBlocks
    .nth(0)
    .getByTestId('template-block-start-time-input')
    .fill('09:00');
  await sundayBlocks
    .nth(0)
    .getByTestId('template-block-end-time-input')
    .fill('09:30');
  await sundayBlocks
    .nth(1)
    .getByTestId('template-block-label-input')
    .fill('Message');
  await sundayBlocks
    .nth(1)
    .getByTestId('template-block-start-time-input')
    .fill('09:30');
  await sundayBlocks
    .nth(1)
    .getByTestId('template-block-end-time-input')
    .fill('10:30');
  await sundayBlocks
    .nth(2)
    .getByTestId('template-block-label-input')
    .fill('Prayer');
  await sundayBlocks
    .nth(2)
    .getByTestId('template-block-start-time-input')
    .fill('10:30');
  await sundayBlocks
    .nth(2)
    .getByTestId('template-block-end-time-input')
    .fill('11:00');
  await createTemplateDialog.getByTestId('create-template-button').click();

  await expect(
    page
      .getByTestId('saved-template-row')
      .filter({ hasText: sundayTemplateName }),
  ).toBeVisible();
  await expect(createTemplateDialog).not.toBeAttached();

  await page.getByTestId('open-create-template-dialog-button').click();
  const secondTemplateDialog = page.getByRole('dialog', {
    name: 'Create template',
  });
  await secondTemplateDialog
    .getByTestId('template-name-input')
    .fill(wednesdayTemplateName);
  await secondTemplateDialog.getByTestId('template-weekday-select').click();
  await page.getByTestId('template-weekday-option-3').click();
  const wednesdayBlock = secondTemplateDialog
    .getByTestId('template-block-row')
    .first();
  await wednesdayBlock
    .getByTestId('template-block-label-input')
    .fill('Midweek');
  await wednesdayBlock
    .getByTestId('template-block-start-time-input')
    .fill('19:00');
  await wednesdayBlock
    .getByTestId('template-block-end-time-input')
    .fill('20:00');
  await secondTemplateDialog.getByTestId('create-template-button').click();

  await expect(
    page
      .getByTestId('saved-template-row')
      .filter({ hasText: wednesdayTemplateName }),
  ).toBeVisible();
  await expect(secondTemplateDialog).not.toBeAttached();

  await page
    .getByTestId('saved-template-row')
    .filter({ hasText: sundayTemplateName })
    .getByTestId('open-edit-template-dialog-button')
    .click();
  const editTemplateDialog = page.getByRole('dialog', {
    name: 'Edit template',
  });
  await editTemplateDialog
    .getByTestId('template-name-input')
    .fill(sundayGatheringName);
  await editTemplateDialog.getByTestId('create-template-button').click();

  await expect(
    page
      .getByTestId('saved-template-row')
      .filter({ hasText: sundayGatheringName }),
  ).toBeVisible();
  await expect(editTemplateDialog).not.toBeAttached();

  await page.getByTestId('back-from-template-library-button').click();
  await page.getByTestId('open-apply-templates-dialog-button').click();

  const applyTemplatesDialog = page.getByRole('dialog', {
    name: 'Apply templates',
  });
  const applyTemplateOptions = applyTemplatesDialog.getByTestId(
    'apply-template-option',
  );
  await applyTemplateOptions
    .filter({ hasText: sundayGatheringName })
    .getByTestId('template-select-checkbox')
    .check();
  await applyTemplateOptions
    .filter({ hasText: wednesdayTemplateName })
    .getByTestId('template-select-checkbox')
    .check();
  await applyTemplatesDialog.getByTestId('apply-templates-button').click();

  await expect(page.getByTestId('planning-event-card')).toHaveCount(
    month.expectedEvents,
  );
  await expect(page.getByTestId('planning-slot-item')).toHaveCount(
    month.expectedSlots,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    month.firstSunday,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    month.firstWednesday,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    month.lastSunday,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    sundayGatheringName,
  );

  // FR-012: the one canonical create-event UI, reused here for a
  // planning-cycle manual event (same form as the ministry "New Event" modal).
  await page.getByRole('button', { name: 'Add event' }).click();
  const createEventDialog = page.getByRole('dialog');
  await createEventDialog.getByLabel('Title').fill('Three-day retreat');
  await createEventDialog.getByRole('radio', { name: 'Day-based' }).click();
  await createEventDialog.getByLabel('Start date').fill(month.dynamicStartDate);
  await createEventDialog.getByLabel('End date').fill(month.dynamicEndDate);
  await createEventDialog.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('planning-event-card')).toHaveCount(
    month.expectedEvents + 1,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    'Three-day retreat',
  );

  // Phase 8: "Create cycle" only lives on the cycles list view now (not on a
  // cycle's own review page) — go back to the list (FR-018/FR-019 nav
  // restructure). The breadcrumb link back to the list is desktop-only
  // chrome (`app-shell.tsx` sidebar/breadcrumb, `md:hidden` below the
  // desktop breakpoint per `specs/019-planning-cycles-table-view`), so this
  // spec — now run at a narrow viewport to keep exercising the card/list
  // presentation — navigates directly instead.
  await page.goto('/scheduling/planning-cycles');
  await expect(page).toHaveURL(/\/scheduling\/planning-cycles\/?$/);
  await page.getByTestId('open-create-cycle-dialog-button').click();
  const overlapDialog = page.getByRole('dialog', { name: 'Create cycle' });
  await overlapDialog
    .getByTestId('cycle-name-input')
    .fill(`${month.cycleName} overlap`);
  await overlapDialog
    .getByTestId('cycle-start-date-input')
    .fill(month.overlapStartDate);
  await overlapDialog
    .getByTestId('cycle-end-date-input')
    .fill(month.overlapEndDate);
  await overlapDialog.getByTestId('create-cycle-button').click();

  await expect(overlapDialog.getByTestId('cycle-create-error')).toContainText(
    'Planning cycle overlaps an existing cycle',
  );
  await overlapDialog.getByRole('button', { name: 'Close' }).click();

  // Closing the failed overlap attempt returns to the cycles list (the
  // dialog's own URL is /new); re-select the original cycle to lock it.
  await expect(page).toHaveURL(/\/scheduling\/planning-cycles\/?$/);
  await page
    .getByTestId('planning-cycle-option')
    .filter({ hasText: month.cycleName })
    .click();
  await expect(page.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );

  await page.getByTestId('lock-cycle-button').click();
  await expect(page.getByTestId('selected-cycle-state')).toHaveText('locked');

  // Step-sequence gating: locked-review is read-only — no editable
  // template/apply controls, while the template library stays reachable.
  await expect(
    page.getByTestId('open-apply-templates-dialog-button'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add event' })).toHaveCount(0);
  await expect(page.getByTestId('open-template-library-button')).toBeVisible();

  const leaderContext = await browser.newContext({
    storageState: LEADER_STORAGE_STATE,
  });
  const leaderPage = await leaderContext.newPage();
  await leaderPage.goto('/scheduling/planning-cycles');
  await leaderPage
    .getByTestId('planning-cycle-option')
    .filter({ hasText: month.cycleName })
    .click();
  await expect(leaderPage.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );
  await leaderContext.close();

  const volunteerContext = await browser.newContext({
    storageState: VOLUNTEER_STORAGE_STATE,
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/scheduling/planning-cycles');
  // Phase 8: a route-level `beforeLoad` guard now redirects non-ChurchAdmin
  // callers away before the page ever renders (FR-015), superseding the old
  // in-component "planning-access-denied" card for this route.
  await expect(volunteerPage).not.toHaveURL(/\/scheduling\/planning-cycles/);
  await expect(volunteerPage.getByTestId('planning-admin-page')).toHaveCount(0);
  await volunteerContext.close();
});
