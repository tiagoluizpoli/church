import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

test('a Ministry leader sees only their led Ministry workspace', async ({
  page,
}, testInfo) => {
  const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
  const { worship, care } = journey.ministries;
  await signInPersonaPage({ page, persona: journey.personas.ministryLeader });

  await page.goto(`/schedules/${worship.id}`);

  await expect(page).toHaveURL(`/schedules/${worship.id}`);
  await expect(page.getByTestId('prepare-cycle-ministry-name')).toBeVisible({
    timeout: 15_000,
  });
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

  await page.goto(`/schedules/${care.id}`);

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('prepare-cycle-ministry-name')).toHaveCount(0);
});
