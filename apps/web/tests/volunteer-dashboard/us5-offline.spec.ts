import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadVolunteerDashboardJourney } from '@/tests/fixtures/journeys/volunteer-dashboard';

test('US5: volunteer keeps the loaded My schedule readable and sees the offline banner when the connection drops', async ({
  page,
}, testInfo) => {
  const journey = loadVolunteerDashboardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.volunteer });
  await page.goto('/my-schedule');

  await expect(
    page.getByRole('heading', { name: 'Minhas escalas' }),
  ).toBeVisible();
  await expect(page.getByText('Modo offline', { exact: true })).toBeHidden();

  await page.context().setOffline(true);

  await expect(page.getByText('Modo offline', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Minhas escalas' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Atualizar escala' }).click();
  await expect(
    page.getByText(
      'Falha ao atualizar offline. Sua última escala conhecida continua disponível.',
    ),
  ).toBeVisible();
});
