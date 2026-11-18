import { m } from '@church/i18n/messages';
import { addCalendarDays, parseCalendarDay } from '@church/time';
import { expect, test } from '@playwright/test';
import {
  assignPreparePath,
  newPersonaRequest,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

interface CycleResponse {
  id: string;
}

test('a Ministry leader sees only their led Ministry workspace', async ({
  page,
}, testInfo) => {
  const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
  const { worship, care } = journey.ministries;
  // The Schedule list indexes sent Cycles. Build one through this journey's
  // own admin, keeping the leader's capabilities and Ministry ownership intact.
  const admin = await newPersonaRequest({ persona: journey.personas.admin });
  const day = addCalendarDays({
    day: parseCalendarDay({ value: journey.anchor }),
    days: 7,
  });
  const cycleName = 'Capability index';
  const cycleResponse = await admin.post('/api/v1/admin/cycles', {
    data: { name: cycleName, startDate: journey.anchor, endDate: day },
  });
  expect(cycleResponse.status()).toBe(201);
  const cycle = (await cycleResponse.json()) as CycleResponse;
  const start = `${day}T15:00:00.000Z`;
  const end = `${day}T17:00:00.000Z`;
  const eventResponse = await admin.post(
    `/api/v1/admin/cycles/${cycle.id}/events`,
    {
      data: {
        title: 'Capability service',
        start,
        end,
        eventTimeBlocks: [{ label: 'Service', startTime: start, endTime: end }],
      },
    },
  );
  expect(eventResponse.status()).toBe(201);
  const sendResponse = await admin.post(
    `/api/v1/admin/cycles/${cycle.id}/send`,
  );
  expect(sendResponse.ok()).toBeTruthy();
  await admin.dispose();
  await signInPersonaPage({ page, persona: journey.personas.ministryLeader });

  await page.goto('/schedules');

  await expect(
    page.getByRole('heading', {
      name: m.schedules_title({}, { locale: 'pt-BR' }),
    }),
  ).toBeVisible();
  const worshipSchedule = page.getByRole('link', {
    name: `${worship.name} · ${cycleName}`,
    exact: false,
  });
  const carePath = assignPreparePath({
    ministryId: care.id,
    cycleId: cycle.id,
  });
  await expect(worshipSchedule).toHaveCount(1);
  await expect(page.locator(`a[href="${carePath}"]`)).toHaveCount(0);
  await worshipSchedule.click();
  await expect(page).toHaveURL(
    assignPreparePath({ ministryId: worship.id, cycleId: cycle.id }),
  );
  await expect(
    page.getByRole('heading', {
      name: m.prepare_schedule_title(
        { ministry: worship.name, cycle: cycleName },
        { locale: 'pt-BR' },
      ),
    }),
  ).toBeVisible();
  const sidebar = page.getByTestId('sidebar');
  await expect(
    sidebar.getByRole('link', {
      name: m.nav_schedules({}, { locale: 'pt-BR' }),
    }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole('link', { name: m.nav_cycles({}, { locale: 'pt-BR' }) }),
  ).toHaveCount(0);
  await expect(
    sidebar.getByRole('link', {
      name: m.nav_event_templates({}, { locale: 'pt-BR' }),
    }),
  ).toHaveCount(0);

  await page.goto(carePath);

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('open-assign-link')).toHaveCount(0);
  await expect(page.getByTestId('prepare-workspace-stack')).toHaveCount(0);
});
