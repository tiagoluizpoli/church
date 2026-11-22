import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import {
  newPersonaRequest,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

// #900 — the Ministries page end to end: server-side search, status filter
// and whole-scope counts, then a Ministry's Usual setup. Paging past the
// first page is proved at the HTTP seam (ministry-list-summary.http.test.ts).
const PT = { locale: 'pt-BR' } as const;

test('a ChurchAdmin searches and filters the Ministries page, then opens a Ministry', async ({
  page,
}, testInfo) => {
  const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
  const { worship, care } = journey.ministries;
  const missions = 'Missões';
  // A third Ministry with no Sector, so the no-sectors filter has one match.
  const admin = await newPersonaRequest({ persona: journey.personas.admin });
  const created = await admin.post('/api/v1/ministries/', {
    data: { name: missions },
  });
  expect(created.status()).toBe(201);
  await admin.dispose();

  await signInPersonaPage({ page, persona: journey.personas.admin });
  await page.goto('/app/ministries');

  const openLink = (name: string) =>
    page.getByRole('link', { name: m.ministries_open_label({ name }, PT) });
  for (const name of [care.name, worship.name, missions]) {
    await expect(openLink(name)).toBeVisible();
  }
  await expect(page.getByTestId('ministries-total-chip')).toContainText('3');
  await expect(page.getByTestId('ministries-no-sectors-chip')).toContainText(
    '1',
  );

  const search = page.getByLabel(m.ministries_name_label({}, PT));
  await search.fill(worship.name.slice(0, 4).toLowerCase());
  await search.press('Enter');
  await expect(page).toHaveURL(/search=/);
  await expect(openLink(worship.name)).toBeVisible();
  await expect(openLink(care.name)).toHaveCount(0);
  await expect(openLink(missions)).toHaveCount(0);
  // Counts cover the whole scope, not the filtered rows.
  await expect(page.getByTestId('ministries-total-chip')).toContainText('3');

  // Search and status combine on the server: Louvor has a Sector.
  await page.getByLabel(m.ministries_filter_status({}, PT)).click();
  await page
    .getByRole('option', { name: m.ministries_filter_no_sectors({}, PT) })
    .click();
  await expect(
    page.getByText(m.ministries_empty_filtered({}, PT)),
  ).toBeVisible();
  await page
    .getByRole('button', { name: m.invitations_clear_filters({}, PT) })
    .click();
  await expect(openLink(care.name)).toBeVisible();

  await page.getByLabel(m.ministries_filter_status({}, PT)).click();
  await page
    .getByRole('option', { name: m.ministries_filter_no_sectors({}, PT) })
    .click();
  await expect(page).toHaveURL(/status=no-sectors/);
  await expect(openLink(missions)).toBeVisible();
  await expect(openLink(worship.name)).toHaveCount(0);
  await expect(openLink(care.name)).toHaveCount(0);

  await page.goto('/app/ministries');
  await openLink(worship.name).click();
  await expect(page).toHaveURL(new RegExp(`/app/ministries/${worship.id}`));

  await page.goto(`/app/ministries/${worship.id}/usual-setup`);
  await expect(
    page.getByRole('region', { name: m.usual_setup_list_label({}, PT) }),
  ).toBeVisible();
  await expect(
    page.getByText(m.usual_setup_no_templates({}, PT)),
  ).toBeVisible();
});
