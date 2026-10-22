import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

test('a Ministry leader can open their led Ministry workspace directly', async ({
  page,
}, testInfo) => {
  const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
  const { worship } = journey.ministries;
  await signInPersonaPage({ page, persona: journey.personas.ministryLeader });

  await page.goto(`/schedules/${worship.id}`);

  await expect(page).toHaveURL(`/schedules/${worship.id}`);
  await expect(page.getByTestId('prepare-cycle-ministry-name')).toBeVisible({
    timeout: 15_000,
  });
});
