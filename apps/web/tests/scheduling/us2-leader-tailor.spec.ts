import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

interface PlanningMonth {
  cycleName: string;
  startDate: string;
  endDate: string;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createPlanningMonth(): PlanningMonth {
  const now = new Date();
  const year = 2150 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  return {
    cycleName: `US2 Tailoring ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}`,
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

test.use({ storageState: LEADER_STORAGE_STATE });

test('leader tailors participation, splits shifts, sets headcounts, and fires availability', async ({
  page,
}) => {
  const month = createPlanningMonth();

  const ministriesResponse = await page.request.get(
    `${SERVER_URL}/api/v1/admin/ministries`,
  );
  expect(ministriesResponse.ok()).toBeTruthy();
  const ministriesBody = (await ministriesResponse.json()) as {
    ministries: { id: string; name: string }[];
  };
  const ministryId = ministriesBody.ministries[0]?.id;
  expect(ministryId).toBeTruthy();

  const existingEventsResponse = await page.request.get(
    `${SERVER_URL}/api/v1/admin/events`,
    {
      params: { ministryId },
    },
  );
  expect(existingEventsResponse.ok()).toBeTruthy();
  const existingEventsBody = (await existingEventsResponse.json()) as {
    events: { id: string }[];
  };
  const existingEventId = existingEventsBody.events[0]?.id;
  expect(existingEventId).toBeTruthy();

  const builderDataResponse = await page.request.get(
    `${SERVER_URL}/api/v1/admin/schedule-builder`,
    {
      params: { eventId: existingEventId },
    },
  );
  expect(builderDataResponse.ok()).toBeTruthy();
  const builderDataBody = (await builderDataResponse.json()) as {
    roles: { id: string }[];
  };
  const roleId = builderDataBody.roles[0]?.id;
  expect(roleId).toBeTruthy();

  const defaultDirectionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${ministryId}/default-direction`,
    {
      data: { defaultDirection: 'all_out' },
    },
  );
  expect(defaultDirectionResponse.ok()).toBeTruthy();

  const cycleResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles`,
    {
      data: {
        name: month.cycleName,
        startDate: month.startDate,
        endDate: month.endDate,
      },
    },
  );
  expect(cycleResponse.ok()).toBeTruthy();
  const cycleBody = (await cycleResponse.json()) as { id: string };

  const templateResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/event-templates`,
    {
      data: {
        name: `US2 Sunday Template ${Date.now()}`,
        weekday: 0,
        blocks: [
          { label: 'Welcome', startTime: '09:00', endTime: '09:30', order: 0 },
          { label: 'Message', startTime: '09:30', endTime: '10:30', order: 1 },
          { label: 'Prayer', startTime: '10:30', endTime: '11:00', order: 2 },
        ],
      },
    },
  );
  expect(templateResponse.ok()).toBeTruthy();
  const templateBody = (await templateResponse.json()) as {
    id: string;
    blocks: { id: string }[];
  };

  const servingProfileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${ministryId}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: templateBody.blocks[0]?.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId, count: 1 }],
          },
          {
            sourceTemplateBlockId: templateBody.blocks[1]?.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId, count: 1 }],
          },
          {
            sourceTemplateBlockId: templateBody.blocks[2]?.id,
            serves: false,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [],
          },
        ],
      },
    },
  );
  expect(servingProfileResponse.ok()).toBeTruthy();

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycleBody.id}/apply-templates`,
    {
      data: { templateIds: [templateBody.id] },
    },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const lockResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycleBody.id}/lock`,
  );
  expect(lockResponse.ok()).toBeTruthy();

  await page.goto('/scheduling/tailoring');
  await page
    .getByTestId('tailoring-ministry-select')
    .selectOption(ministryId || '');
  await page.getByTestId('tailoring-cycle-select').selectOption(cycleBody.id);

  const eventCard = page.getByTestId('participation-event-card').first();
  const firstSlotCard = eventCard.getByTestId('participation-slot-card').nth(0);

  await expect(
    eventCard.getByTestId('participation-slot-checkbox-0'),
  ).toBeChecked();
  await expect(
    eventCard.getByTestId('participation-slot-checkbox-1'),
  ).toBeChecked();
  await expect(
    eventCard.getByTestId('participation-slot-checkbox-2'),
  ).not.toBeChecked();

  await firstSlotCard.getByTestId('equal-split-count-0').fill('2');
  await firstSlotCard.getByTestId('save-split-button-0').click();

  await expect(
    firstSlotCard.getByTestId('participation-shift-card'),
  ).toHaveCount(2);

  await firstSlotCard
    .locator('[data-testid^="headcount-input-0-0-"]')
    .first()
    .fill('2');
  await firstSlotCard
    .locator('[data-testid^="headcount-input-0-1-"]')
    .first()
    .fill('1');
  await firstSlotCard.getByTestId('save-headcounts-button-0-0').click();
  await firstSlotCard.getByTestId('save-headcounts-button-0-1').click();

  await eventCard.locator('[data-testid^="fire-availability-button-"]').click();

  await expect(eventCard.getByTestId('participation-state-badge')).toHaveText(
    'availability_fired',
  );
  await expect(
    eventCard.getByTestId('fire-availability-summary'),
  ).toContainText('checks created');
});
