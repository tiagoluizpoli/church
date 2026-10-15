import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

test('a Ministry leader sees only their led Ministry workspace', async ({
  page,
}, testInfo) => {
  const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
  const { worship, care } = journey.ministries;
  await signInPersonaPage({ page, persona: journey.personas.ministryLeader });

  await page.goto('/scheduling');

  await expect(
    page.getByRole('link', { name: `Open ${worship.name}` }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open church planning' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: `Open ${care.name}` }),
  ).toHaveCount(0);

  await page.getByRole('link', { name: `Open ${worship.name}` }).click();
  await expect(page).toHaveURL(`/schedules/${worship.id}`);
});
