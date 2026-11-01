import { expect, test } from '@playwright/test';
import { fillDatePickerField } from './date-picker.helpers';
import { planningMonth } from './planning-month.helpers';
import { createTemplateOnNestedPage } from './template-create.helpers';
import {
  newPersonaContext,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import {
  loadPlanningAdminJourney,
  type PlanningAdminJourney,
} from '@/tests/fixtures/journeys/planning-admin';

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
  expectedEventTimeBlocks: number;
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

/** Mirrors `useTimezone().format(date, 'PP')` — the mobile card list (021
 * US2) renders every day-row date through that call instead of a raw ISO
 * string, so assertions against `planning-events-list` must match its
 * human-readable output, not the `YYYY-MM-DD` the cycle was seeded with. */
/** Mirrors `formatDayOf` (apps/web/src/shared/utils/church-time.ts), which
 * every event display renders through — assertions against
 * `planning-events-list` must match its fixed `dd/MM/yyyy` output, not the
 * `YYYY-MM-DD` the day was picked with. */
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(day)}/${pad(month)}/${year}`;
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

interface CreatePlanningMonthParams {
  journey: PlanningAdminJourney;
}

/** The calendar month after the journey's anchor, as the cycle to plan. */
function createPlanningMonth({
  journey,
}: CreatePlanningMonthParams): PlanningMonth {
  const window = planningMonth({ anchor: journey.anchor });
  const start = new Date(`${window.startDate}T00:00:00Z`);
  const end = new Date(`${window.endDate}T00:00:00Z`);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
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
    cycleName: `US1 Admin Plan ${year}-${String(month + 1).padStart(2, '0')}`,
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
    expectedEventTimeBlocks: sundayDates.length * 3 + wednesdayDates.length,
    dynamicStartDate: toDateString(dynamicStart),
    dynamicEndDate: toDateString(dynamicEnd),
  };
}

test.use({ viewport: { width: 767, height: 1200 } });

test('church admin can plan, review, and send a cycle while volunteers stay hidden from it', async ({
  browser,
  page,
}, testInfo) => {
  const journey = loadPlanningAdminJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  const month = createPlanningMonth({ journey });
  const sundayTemplateName = `Sunday Service ${month.cycleName}`;
  const wednesdayTemplateName = `Wednesday Service ${month.cycleName}`;
  const sundayGatheringName = `Sunday Gathering ${month.cycleName}`;

  await page.goto('/cycles');

  await page.getByTestId('open-create-cycle-dialog-button').click();
  const createCycleDialog = page.getByRole('dialog', { name: 'Create cycle' });
  await createCycleDialog.getByTestId('cycle-name-input').fill(month.cycleName);
  await fillDatePickerField({
    page,
    trigger: createCycleDialog.getByTestId('cycle-start-date-input'),
    date: month.startDate,
  });
  await fillDatePickerField({
    page,
    trigger: createCycleDialog.getByTestId('cycle-end-date-input'),
    date: month.endDate,
  });
  await createCycleDialog.getByTestId('create-cycle-button').click();

  await expect(page.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );
  await expect(page.getByTestId('selected-cycle-state')).toHaveText('draft');

  const cycleReviewUrl = page.url();
  await page.getByTestId('open-template-library-button').click();

  await createTemplateOnNestedPage({
    page,
    name: sundayTemplateName,
    weekday: 0,
    blocks: [
      { label: 'Welcome', startTime: '09:00', endTime: '09:30' },
      { label: 'Message', startTime: '09:30', endTime: '10:30' },
      { label: 'Prayer', startTime: '10:30', endTime: '11:00' },
    ],
  });
  await createTemplateOnNestedPage({
    page,
    name: wednesdayTemplateName,
    weekday: 3,
    blocks: [{ label: 'Midweek', startTime: '19:00', endTime: '20:00' }],
  });

  await page
    .getByTestId('saved-template-row')
    .filter({ hasText: sundayTemplateName })
    .getByTestId('edit-template-button')
    .click();
  await expect(page.getByTestId('template-edit-page')).toBeVisible();
  await page.getByTestId('template-name-input').fill(sundayGatheringName);
  await page.getByTestId('create-template-button').click();

  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(
    page
      .getByTestId('saved-template-row')
      .filter({ hasText: sundayGatheringName }),
  ).toBeAttached();

  await page.goto(cycleReviewUrl);
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
  await expect(page.getByTestId('planning-event-time-block-item')).toHaveCount(
    month.expectedEventTimeBlocks,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    toDisplayDate(month.firstSunday),
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    toDisplayDate(month.firstWednesday),
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    toDisplayDate(month.lastSunday),
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    sundayGatheringName,
  );

  // FR-012: the one canonical create-event UI, reused here for a
  // cycle manual event (same form as the ministry "New Event" modal).
  await page.getByRole('button', { name: 'Add event' }).click();
  const createEventDialog = page.getByRole('dialog');
  await createEventDialog.getByLabel('Title').fill('Three-day retreat');
  await fillDatePickerField({
    page,
    trigger: createEventDialog.getByLabel('Start date'),
    date: month.dynamicStartDate,
  });
  await fillDatePickerField({
    page,
    trigger: createEventDialog.getByLabel('End date'),
    date: month.dynamicEndDate,
  });
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
  await page.goto('/cycles');
  await expect(page).toHaveURL(/\/cycles\/?$/);
  await page.getByTestId('open-create-cycle-dialog-button').click();
  const overlapDialog = page.getByRole('dialog', { name: 'Create cycle' });
  await overlapDialog
    .getByTestId('cycle-name-input')
    .fill(`${month.cycleName} overlap`);
  await fillDatePickerField({
    page,
    trigger: overlapDialog.getByTestId('cycle-start-date-input'),
    date: month.overlapStartDate,
  });
  await fillDatePickerField({
    page,
    trigger: overlapDialog.getByTestId('cycle-end-date-input'),
    date: month.overlapEndDate,
  });
  await overlapDialog.getByTestId('create-cycle-button').click();

  await expect(overlapDialog.getByTestId('cycle-create-error')).toContainText(
    'Este ciclo se sobrepõe a um ciclo existente.',
  );
  await overlapDialog.getByRole('button', { name: 'Close' }).click();

  // Closing the failed overlap attempt returns to the cycles list (the
  // dialog's own URL is /new); re-select the original cycle to send it.
  await expect(page).toHaveURL(/\/cycles\/?$/);
  await page
    .getByTestId('cycle-option')
    .filter({ hasText: month.cycleName })
    .click();
  await expect(page.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );

  await page.getByTestId('send-cycle-button').click();
  await expect(page.getByTestId('selected-cycle-state')).toHaveText('sent');

  // Step-sequence gating: sent-review is read-only — no editable
  // template/apply controls, while the template library stays reachable.
  await expect(
    page.getByTestId('open-apply-templates-dialog-button'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add event' })).toHaveCount(0);
  await expect(page.getByTestId('open-template-library-button')).toBeVisible();

  // A second session of the ChurchAdmin, who leads Worship: it sees the
  // sent cycle too.
  const leaderContext = await newPersonaContext({
    browser,
    persona: journey.personas.admin,
  });
  const leaderPage = await leaderContext.newPage();
  await leaderPage.goto('/cycles');
  await leaderPage
    .getByTestId('cycle-option')
    .filter({ hasText: month.cycleName })
    .click();
  await expect(leaderPage.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );
  await leaderContext.close();

  const volunteerContext = await newPersonaContext({
    browser,
    persona: journey.personas.volunteer,
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/cycles');
  // Phase 8: a route-level `beforeLoad` guard now redirects non-ChurchAdmin
  // callers away before the page ever renders (FR-015), superseding the old
  // in-component "planning-access-denied" card for this route.
  await expect(volunteerPage).not.toHaveURL(/\/cycles/);
  await expect(volunteerPage.getByTestId('planning-admin-page')).toHaveCount(0);
  await volunteerContext.close();
});
