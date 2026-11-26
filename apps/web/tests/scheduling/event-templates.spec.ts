import { expect, test } from '@playwright/test';
import { fillTimeOfDayField } from './time-field.helpers';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadEventTemplatesJourney } from '@/tests/fixtures/journeys/event-templates';

test.use({ viewport: { width: 767, height: 1200 } });

// J3 (Spec 13): list → create → edit → confirm delete. The persistence and
// permission matrix stays in HTTP tests.
test('church admin lists Event templates, creates an overnight one, edits it in route-driven dialogs and deletes it from the list after confirmation', async ({
  page,
}, testInfo) => {
  const journey = loadEventTemplatesJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  const templateName = 'Vigília da madrugada';

  await page.goto('/');
  // At this viewport the Scheduling navigation lives in the drawer.
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Modelos de evento' })
    .click();

  await expect(page).toHaveURL(/\/event-templates$/);
  const rows = page.getByTestId('saved-template-row');
  await expect(rows.first()).toContainText(journey.templates[0]?.name ?? '');
  await expect(rows.nth(1)).toContainText(journey.templates[1]?.name ?? '');

  await page.getByTestId('new-template-button').click();
  await expect(page).toHaveURL(/\/event-templates\/new$/);
  // Below 768px the create surface is the bottom drawer.
  const create = page.getByTestId('template-create-dialog');
  await expect(create).toBeVisible();

  await create.getByTestId('template-name-input').fill(templateName);
  await create.getByTestId('template-weekday-toggle-3').click();
  await create.getByTestId('template-weekday-toggle-0').click();

  const block = create.getByTestId('template-time-block-row').first();
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

  await create.getByTestId('create-template-button').click();

  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(create).toBeHidden();
  await expect(
    page.getByTestId('saved-template-row').filter({ hasText: templateName }),
  ).toBeVisible();

  // Edit: the dialog's route reads its own target, so a refresh reopens it.
  await page
    .getByTestId('saved-template-row')
    .filter({ hasText: templateName })
    .getByTestId('edit-template-button')
    .click();
  await expect(page).toHaveURL(/\/event-templates\/[0-9a-f-]+$/);
  await page.reload();
  const edit = page.getByTestId('template-edit-dialog');
  const nameInput = edit.getByTestId('template-name-input');
  await expect(nameInput).toHaveValue(templateName);
  await expect(
    edit.getByTestId('template-time-block-label-input').first(),
  ).toHaveValue('Vigília');
  await expect(edit.getByTestId('delete-template-button')).toHaveCount(0);

  const renamed = 'Vigília de sexta';
  await nameInput.fill(renamed);
  await edit.getByTestId('template-weekday-toggle-5').click();
  await edit.getByTestId('template-weekday-toggle-3').click();
  await edit.getByTestId('add-template-time-block-button').click();
  const added = edit.getByTestId('template-time-block-row').nth(1);
  await added.getByTestId('template-time-block-label-input').fill('Louvor');
  await fillTimeOfDayField({
    field: added.getByTestId('template-time-block-start-time-input'),
    time: '20:00',
  });
  await fillTimeOfDayField({
    field: added.getByTestId('template-time-block-end-time-input'),
    time: '21:30',
  });
  await edit.getByTestId('create-template-button').click();

  // Retained blocks need no removal confirmation.
  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(edit).toBeHidden();
  const editedRow = page
    .getByTestId('saved-template-row')
    .filter({ hasText: renamed });
  await expect(editedRow).toBeVisible();
  await expect(editedRow).toContainText(/sexta-feira · 2 blocos/i);

  // Delete lives on the list row: confirmation first, then gone from the list.
  await editedRow.getByTestId('delete-template-button').click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Excluir este modelo?',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(editedRow).toBeVisible();

  await editedRow.getByTestId('delete-template-button').click();
  await dialog.getByTestId('confirm-template-delete-button').click();

  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(
    page.getByTestId('saved-template-row').filter({ hasText: renamed }),
  ).toHaveCount(0);
});
