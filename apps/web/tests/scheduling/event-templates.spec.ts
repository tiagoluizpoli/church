import { expect, test } from '@playwright/test';
import { fillTimeOfDayField } from './time-field.helpers';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadEventTemplatesJourney } from '@/tests/fixtures/journeys/event-templates';

test.use({ viewport: { width: 767, height: 1200 } });

// J3, list → create segment (Spec 13). Edit and delete join this journey with
// their own tickets.
test('church admin lists Event templates, then creates an overnight one on the nested page', async ({
  page,
}, testInfo) => {
  const journey = loadEventTemplatesJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  const templateName = 'Vigília da madrugada';

  await page.goto('/');
  await page.getByRole('link', { name: 'Modelos de evento' }).first().click();

  await expect(page).toHaveURL(/\/event-templates$/);
  const rows = page.getByTestId('saved-template-row');
  await expect(rows.first()).toContainText(journey.templates[0]?.name ?? '');
  await expect(rows.nth(1)).toContainText(journey.templates[1]?.name ?? '');

  await page.getByTestId('new-template-button').click();
  await expect(page).toHaveURL(/\/event-templates\/new$/);

  await page.getByTestId('template-name-input').fill(templateName);
  await page.getByTestId('template-weekday-select').click();
  await page.getByTestId('template-weekday-option-3').click();

  const block = page.getByTestId('template-time-block-row').first();
  await block.getByTestId('template-time-block-label-input').fill('Vigília');
  await fillTimeOfDayField({
    field: block.getByTestId('template-time-block-start-time-input'),
    time: '22:00',
  });
  await fillTimeOfDayField({
    field: block.getByTestId('template-time-block-end-time-input'),
    time: '02:00',
  });

  await expect(block.getByTestId('template-time-block-span')).toHaveText(
    'Dura 4 h · termina no dia seguinte',
  );

  await page.getByTestId('create-template-button').click();

  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(
    page.getByTestId('saved-template-row').filter({ hasText: templateName }),
  ).toBeVisible();
});
