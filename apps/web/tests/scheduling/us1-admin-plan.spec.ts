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
  dynamicStartHour: string;
  dynamicStartMinute: string;
  dynamicEndDate: string;
  dynamicEndHour: string;
  dynamicEndMinute: string;
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

function toHourString(date: Date): string {
  return date.toISOString().slice(11, 13);
}

function toMinuteString(date: Date): string {
  return date.toISOString().slice(14, 16);
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
  const year = 2100 + (Math.floor(now.getTime() / 1000) % 50);
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
    dynamicStartHour: toHourString(dynamicStart),
    dynamicStartMinute: toMinuteString(dynamicStart),
    dynamicEndDate: toDateString(dynamicEnd),
    dynamicEndHour: toHourString(dynamicEnd),
    dynamicEndMinute: toMinuteString(dynamicEnd),
  };
}

test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

test('church admin can plan, review, and lock a cycle while volunteers stay hidden from it', async ({
  browser,
  page,
}) => {
  const month = createPlanningMonth();

  await page.goto('/scheduling/planning');

  await page.getByTestId('cycle-name-input').fill(month.cycleName);
  await page.getByTestId('cycle-start-date-input').fill(month.startDate);
  await page.getByTestId('cycle-end-date-input').fill(month.endDate);
  await page.getByTestId('create-cycle-button').click();

  await expect(page.getByTestId('selected-cycle-name')).toHaveText(
    month.cycleName,
  );
  await expect(page.getByTestId('selected-cycle-state')).toHaveText('draft');

  await page.getByTestId('template-name-input').fill('Sunday Service');
  await page.getByTestId('template-weekday-select').selectOption('0');
  await page.getByTestId('add-template-block-button').click();
  await page.getByTestId('add-template-block-button').click();

  const sundayBlocks = page.getByTestId('template-block-row');
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
  await page.getByTestId('create-template-button').click();

  await expect(
    page
      .getByTestId('saved-template-row')
      .filter({ hasText: 'Sunday Service' }),
  ).toBeVisible();

  await page.getByTestId('template-name-input').fill('Wednesday Service');
  await page.getByTestId('template-weekday-select').selectOption('3');
  const wednesdayBlock = page.getByTestId('template-block-row').first();
  await wednesdayBlock
    .getByTestId('template-block-label-input')
    .fill('Midweek');
  await wednesdayBlock
    .getByTestId('template-block-start-time-input')
    .fill('19:00');
  await wednesdayBlock
    .getByTestId('template-block-end-time-input')
    .fill('20:00');
  await page.getByTestId('create-template-button').click();

  await expect(
    page
      .getByTestId('saved-template-row')
      .filter({ hasText: 'Wednesday Service' }),
  ).toBeVisible();

  await page.getByTestId('apply-templates-button').click();

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

  // FR-012: the one canonical create-event UI, reused here for a
  // planning-cycle manual event (same form as the ministry "New Event" modal).
  await page.getByRole('button', { name: 'Add manual event' }).click();
  const createEventDialog = page.getByRole('dialog');
  await createEventDialog.getByLabel('Title').fill('Three-day retreat');
  await createEventDialog.getByLabel('Start date').fill(month.dynamicStartDate);
  await createEventDialog.getByLabel('Start hour').fill(month.dynamicStartHour);
  await createEventDialog
    .getByLabel('Start minute')
    .fill(month.dynamicStartMinute);
  await createEventDialog.getByLabel('End date').fill(month.dynamicEndDate);
  await createEventDialog.getByLabel('End hour').fill(month.dynamicEndHour);
  await createEventDialog.getByLabel('End minute').fill(month.dynamicEndMinute);
  await createEventDialog.getByRole('radio', { name: 'Day-based' }).click();
  await createEventDialog.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('planning-event-card')).toHaveCount(
    month.expectedEvents + 1,
  );
  await expect(page.getByTestId('planning-events-list')).toContainText(
    'Three-day retreat',
  );

  await page.getByTestId('cycle-name-input').fill(`${month.cycleName} overlap`);
  await page.getByTestId('cycle-start-date-input').fill(month.overlapStartDate);
  await page.getByTestId('cycle-end-date-input').fill(month.overlapEndDate);
  await page.getByTestId('create-cycle-button').click();

  await expect(page.getByTestId('cycle-create-error')).toContainText(
    'Planning cycle overlaps an existing cycle',
  );

  await page.getByTestId('lock-cycle-button').click();
  await expect(page.getByTestId('selected-cycle-state')).toHaveText('locked');

  // Step-sequence gating: locked-review is read-only — no editable
  // template/create controls, though the cycle list/create panel below
  // stays reachable (e.g. for starting a different cycle).
  await expect(page.getByTestId('template-name-input')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add manual event' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('cycle-name-input')).toBeVisible();

  const leaderContext = await browser.newContext({
    storageState: LEADER_STORAGE_STATE,
  });
  const leaderPage = await leaderContext.newPage();
  await leaderPage.goto('/scheduling/planning');
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
  await volunteerPage.goto('/scheduling/planning');
  await expect(
    volunteerPage.getByTestId('planning-access-denied'),
  ).toBeVisible();
  await expect(volunteerPage.getByTestId('planning-admin-page')).toHaveCount(0);
  await volunteerContext.close();
});
